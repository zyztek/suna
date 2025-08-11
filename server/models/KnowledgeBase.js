
const mongoose = require('mongoose');

const knowledgeBaseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    maxlength: 10000
  },
  summary: {
    type: String,
    maxlength: 500
  },
  category: {
    type: String,
    required: true,
    enum: [
      'programming', 'design', 'business', 'marketing', 
      'productivity', 'tutorials', 'best-practices', 'tools'
    ]
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: 1000
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    readTime: Number, // in minutes
    codeExamples: Boolean,
    externalLinks: [String],
    prerequisites: [String]
  },
  searchKeywords: [String], // for better search functionality
  isPublic: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
knowledgeBaseSchema.index({ title: 'text', content: 'text', tags: 'text' });
knowledgeBaseSchema.index({ category: 1 });
knowledgeBaseSchema.index({ difficulty: 1 });
knowledgeBaseSchema.index({ status: 1 });
knowledgeBaseSchema.index({ author: 1 });
knowledgeBaseSchema.index({ views: -1 });
knowledgeBaseSchema.index({ createdAt: -1 });

// Virtual for like count
knowledgeBaseSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

// Virtual for comment count
knowledgeBaseSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Method to increment views
knowledgeBaseSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Method to add like
knowledgeBaseSchema.methods.addLike = function(userId) {
  const existingLike = this.likes.find(like => like.user.toString() === userId.toString());
  if (!existingLike) {
    this.likes.push({ user: userId });
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to remove like
knowledgeBaseSchema.methods.removeLike = function(userId) {
  this.likes = this.likes.filter(like => like.user.toString() !== userId.toString());
  return this.save();
};

// Pre-save middleware to generate search keywords
knowledgeBaseSchema.pre('save', function(next) {
  if (this.isModified('title') || this.isModified('content') || this.isModified('tags')) {
    const keywords = [
      ...this.title.toLowerCase().split(' '),
      ...this.content.toLowerCase().split(' ').slice(0, 50), // First 50 words
      ...this.tags
    ].filter(word => word.length > 2);
    
    this.searchKeywords = [...new Set(keywords)]; // Remove duplicates
  }
  next();
});

module.exports = mongoose.model('KnowledgeBase', knowledgeBaseSchema);
