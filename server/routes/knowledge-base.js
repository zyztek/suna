
const express = require('express');
const KnowledgeBase = require('../models/KnowledgeBase');
const auth = require('../middleware/auth');
const Sentry = require('@sentry/node');

const router = express.Router();

// Get all published knowledge base articles with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      difficulty,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query
    let query = { status: 'published', isPublic: true };

    if (category) {
      query.category = category;
    }

    if (difficulty) {
      query.difficulty = difficulty;
    }

    if (search) {
      query.$text = { $search: search };
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const [articles, total] = await Promise.all([
      KnowledgeBase.find(query)
        .populate('author', 'name avatar')
        .select('-comments -searchKeywords')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      KnowledgeBase.countDocuments(query)
    ]);

    // Add virtual fields
    const articlesWithCounts = articles.map(article => ({
      ...article,
      likeCount: article.likes?.length || 0,
      commentCount: article.comments?.length || 0
    }));

    res.json({
      articles: articlesWithCounts,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Get articles error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Get single article by ID
router.get('/:id', async (req, res) => {
  try {
    const article = await KnowledgeBase.findOne({
      _id: req.params.id,
      status: 'published',
      isPublic: true
    })
    .populate('author', 'name avatar')
    .populate('comments.user', 'name avatar');

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Increment view count
    await article.incrementViews();

    res.json({
      article: {
        ...article.toJSON(),
        likeCount: article.likes.length,
        commentCount: article.comments.length
      }
    });

  } catch (error) {
    console.error('Get article error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// Create new article (authenticated users only)
router.post('/', auth, async (req, res) => {
  try {
    const {
      title,
      content,
      summary,
      category,
      tags,
      difficulty,
      metadata,
      isPublic = true
    } = req.body;

    // Validation
    if (!title || !content || !category) {
      return res.status(400).json({
        error: 'Title, content, and category are required'
      });
    }

    const article = new KnowledgeBase({
      title,
      content,
      summary,
      category,
      tags: tags || [],
      difficulty: difficulty || 'beginner',
      author: req.user.userId,
      metadata: metadata || {},
      isPublic,
      status: 'draft'
    });

    await article.save();
    await article.populate('author', 'name avatar');

    res.status(201).json({
      message: 'Article created successfully',
      article
    });

  } catch (error) {
    console.error('Create article error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to create article' });
  }
});

// Update article (author only)
router.put('/:id', auth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findOne({
      _id: req.params.id,
      author: req.user.userId
    });

    if (!article) {
      return res.status(404).json({ error: 'Article not found or unauthorized' });
    }

    const updateData = req.body;
    delete updateData._id;
    delete updateData.author;
    delete updateData.views;
    delete updateData.likes;
    delete updateData.comments;

    Object.assign(article, updateData);
    await article.save();
    await article.populate('author', 'name avatar');

    res.json({
      message: 'Article updated successfully',
      article
    });

  } catch (error) {
    console.error('Update article error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to update article' });
  }
});

// Delete article (author only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findOneAndDelete({
      _id: req.params.id,
      author: req.user.userId
    });

    if (!article) {
      return res.status(404).json({ error: 'Article not found or unauthorized' });
    }

    res.json({ message: 'Article deleted successfully' });

  } catch (error) {
    console.error('Delete article error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to delete article' });
  }
});

// Like/unlike article
router.post('/:id/like', auth, async (req, res) => {
  try {
    const article = await KnowledgeBase.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const existingLike = article.likes.find(
      like => like.user.toString() === req.user.userId
    );

    if (existingLike) {
      await article.removeLike(req.user.userId);
      res.json({ message: 'Like removed', liked: false });
    } else {
      await article.addLike(req.user.userId);
      res.json({ message: 'Article liked', liked: true });
    }

  } catch (error) {
    console.error('Like article error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to like article' });
  }
});

// Add comment to article
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const article = await KnowledgeBase.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    article.comments.push({
      user: req.user.userId,
      content: content.trim()
    });

    await article.save();
    await article.populate('comments.user', 'name avatar');

    const newComment = article.comments[article.comments.length - 1];

    res.status(201).json({
      message: 'Comment added successfully',
      comment: newComment
    });

  } catch (error) {
    console.error('Add comment error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get user's own articles
router.get('/my/articles', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let query = { author: req.user.userId };
    if (status) {
      query.status = status;
    }

    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [articles, total] = await Promise.all([
      KnowledgeBase.find(query)
        .populate('author', 'name avatar')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      KnowledgeBase.countDocuments(query)
    ]);

    res.json({
      articles,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total
      }
    });

  } catch (error) {
    console.error('Get my articles error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch your articles' });
  }
});

module.exports = router;
