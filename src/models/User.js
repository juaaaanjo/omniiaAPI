const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * User Schema
 */
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: 2,
    maxlength: 100,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false, // Don't return password by default
  },
  company: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  language: {
    type: String,
    enum: ['es', 'en'],
    default: 'es', // Default to Spanish
  },
  integrations: {
    metaAds: {
      connected: { type: Boolean, default: false },
      accessToken: String,
      accessTokenExpiresAt: Date,
      accountId: String,
      accountName: String,
      lastSync: Date,
    },
    transactions: {
      connected: { type: Boolean, default: false },
      lastSync: Date,
    },
    excelTransactions: {
      connected: { type: Boolean, default: false },
      lastSyncedAt: Date,
    },
  },
  // Data source access control
  enabledDataSources: {
    type: [String],
    default: function() {
      // Default data sources for all users
      return ['metaAds'];
    },
    enum: ['metaAds', 'transactions', 'excelTransactions'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
  },
  resetPasswordToken: {
    type: String,
    select: false,
  },
  resetPasswordExpires: {
    type: Date,
    select: false,
  },
}, {
  timestamps: true,
});

/**
 * Hash password before saving
 */
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Compare password method
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

/**
 * Get user without sensitive data
 */
userSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.integrations.metaAds.accessToken;
  return obj;
};

/**
 * Update last login
 */
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  return this.save();
};

/**
 * Check if user has access to a specific data source
 */
userSchema.methods.hasDataSourceAccess = function(dataSource) {
  return this.enabledDataSources.includes(dataSource);
};

/**
 * Get available data sources for this user
 */
userSchema.methods.getAvailableDataSources = function() {
  return {
    metaAds: this.enabledDataSources.includes('metaAds'),
    transactions: this.enabledDataSources.includes('transactions'),
    excelTransactions: this.enabledDataSources.includes('excelTransactions'),
  };
};

/**
 * Generate password reset token
 */
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

/**
 * Enable a data source for domain (static method)
 * Automatically enables data sources for users with specific email domains
 */
userSchema.pre('save', function(next) {
  // Auto-enable data sources based on email domain
  const emailDomain = this.email.split('@')[1];

  // Ommeo.org accounts get access to transactions and excelTransactions
  if (emailDomain === 'ommeo.org') {
    if (!this.enabledDataSources.includes('transactions')) {
      this.enabledDataSources.push('transactions');
    }
    if (!this.enabledDataSources.includes('excelTransactions')) {
      this.enabledDataSources.push('excelTransactions');
    }
  }

  next();
});

module.exports = mongoose.model('User', userSchema);
