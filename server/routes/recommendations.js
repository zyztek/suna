
const express = require('express');
const KnowledgeBase = require('../models/KnowledgeBase');
const User = require('../models/User');
const auth = require('../middleware/auth');
const Sentry = require('@sentry/node');

const router = express.Router();

// Get personalized recommendations for authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const recommendations = await getPersonalizedRecommendations(user);

    res.json({
      recommendations,
      userPreferences: user.preferences,
      totalRecommendations: recommendations.length
    });

  } catch (error) {
    console.error('Get recommendations error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Get trending articles
router.get('/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    // Get articles with high engagement (views + likes) from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trending = await KnowledgeBase.aggregate([
      {
        $match: {
          status: 'published',
          isPublic: true,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $addFields: {
          engagement: {
            $add: [
              '$views',
              { $multiply: [{ $size: '$likes' }, 3] }, // Weight likes 3x
              { $size: '$comments' }
            ]
          }
        }
      },
      {
        $sort: { engagement: -1 }
      },
      {
        $limit: limit
      },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
          pipeline: [{ $project: { name: 1, avatar: 1 } }]
        }
      },
      {
        $unwind: '$author'
      },
      {
        $project: {
          title: 1,
          summary: 1,
          category: 1,
          difficulty: 1,
          tags: 1,
          author: 1,
          views: 1,
          likeCount: { $size: '$likes' },
          commentCount: { $size: '$comments' },
          engagement: 1,
          createdAt: 1
        }
      }
    ]);

    res.json({
      trending,
      period: '30 days',
      total: trending.length
    });

  } catch (error) {
    console.error('Get trending error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to get trending articles' });
  }
});

// Get category-based recommendations
router.get('/by-category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const excludeId = req.query.exclude;

    let query = {
      category,
      status: 'published',
      isPublic: true
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const articles = await KnowledgeBase.find(query)
      .populate('author', 'name avatar')
      .select('-content -searchKeywords')
      .sort({ views: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const articlesWithCounts = articles.map(article => ({
      ...article,
      likeCount: article.likes?.length || 0,
      commentCount: article.comments?.length || 0
    }));

    res.json({
      articles: articlesWithCounts,
      category,
      total: articlesWithCounts.length
    });

  } catch (error) {
    console.error('Get category recommendations error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to get category recommendations' });
  }
});

// Get similar articles based on tags
router.get('/similar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    // Get the reference article
    const referenceArticle = await KnowledgeBase.findById(id);
    if (!referenceArticle) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Find similar articles based on tags and category
    const similar = await KnowledgeBase.find({
      _id: { $ne: id },
      status: 'published',
      isPublic: true,
      $or: [
        { tags: { $in: referenceArticle.tags } },
        { category: referenceArticle.category }
      ]
    })
    .populate('author', 'name avatar')
    .select('-content -searchKeywords')
    .sort({ views: -1 })
    .limit(limit)
    .lean();

    const similarWithCounts = similar.map(article => ({
      ...article,
      likeCount: article.likes?.length || 0,
      commentCount: article.comments?.length || 0
    }));

    res.json({
      similar: similarWithCounts,
      referenceArticle: {
        id: referenceArticle._id,
        title: referenceArticle.title,
        category: referenceArticle.category,
        tags: referenceArticle.tags
      },
      total: similarWithCounts.length
    });

  } catch (error) {
    console.error('Get similar articles error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to get similar articles' });
  }
});

// Advanced recommendation algorithm
async function getPersonalizedRecommendations(user) {
  try {
    const userPreferences = user.preferences || {};
    const preferredCategories = userPreferences.categories || [];
    const preferredDifficulty = userPreferences.difficulty || 'beginner';

    // Build recommendation pipeline
    const pipeline = [];

    // Match published articles
    pipeline.push({
      $match: {
        status: 'published',
        isPublic: true
      }
    });

    // Add scoring based on user preferences
    pipeline.push({
      $addFields: {
        score: {
          $add: [
            // Base score from engagement
            {
              $add: [
                { $multiply: ['$views', 0.1] },
                { $multiply: [{ $size: '$likes' }, 2] },
                { $size: '$comments' }
              ]
            },
            // Category preference bonus
            {
              $cond: {
                if: { $in: ['$category', preferredCategories] },
                then: 50,
                else: 0
              }
            },
            // Difficulty match bonus
            {
              $cond: {
                if: { $eq: ['$difficulty', preferredDifficulty] },
                then: 30,
                else: 0
              }
            },
            // Recency bonus (newer articles get higher score)
            {
              $multiply: [
                {
                  $divide: [
                    { $subtract: [new Date(), '$createdAt'] },
                    1000 * 60 * 60 * 24 * 30 // 30 days in milliseconds
                  ]
                },
                -5 // Negative multiplier so newer articles score higher
              ]
            }
          ]
        }
      }
    });

    // Sort by score
    pipeline.push({
      $sort: { score: -1 }
    });

    // Limit results
    pipeline.push({
      $limit: 20
    });

    // Populate author information
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        as: 'author',
        pipeline: [{ $project: { name: 1, avatar: 1 } }]
      }
    });

    pipeline.push({
      $unwind: '$author'
    });

    // Project final fields
    pipeline.push({
      $project: {
        title: 1,
        summary: 1,
        category: 1,
        difficulty: 1,
        tags: 1,
        author: 1,
        views: 1,
        likeCount: { $size: '$likes' },
        commentCount: { $size: '$comments' },
        score: 1,
        createdAt: 1,
        metadata: 1
      }
    });

    const recommendations = await KnowledgeBase.aggregate(pipeline);

    return recommendations;

  } catch (error) {
    console.error('Personalized recommendations error:', error);
    throw error;
  }
}

module.exports = router;
