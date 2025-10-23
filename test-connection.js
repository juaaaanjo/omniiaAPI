/**
 * MongoDB Connection Test Script
 * Run with: node test-connection.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const testConnection = async () => {
  try {
    console.log('🔄 Attempting to connect to MongoDB Atlas...');
    console.log('📍 URI:', process.env.MONGODB_URI.replace(/:[^:@]+@/, ':****@')); // Hide password

    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    console.log('✅ Successfully connected to MongoDB Atlas!');
    console.log('📊 Database:', mongoose.connection.name);
    console.log('🌐 Host:', mongoose.connection.host);
    console.log('🔌 Port:', mongoose.connection.port);

    // List collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📁 Collections:', collections.length > 0 ? collections.map(c => c.name).join(', ') : 'No collections yet');

    await mongoose.connection.close();
    console.log('\n👋 Connection closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
};

testConnection();
