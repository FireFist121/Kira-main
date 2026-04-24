const mongoose = require('mongoose');

const workSchema = new mongoose.Schema({
  title: { type: String, required: true },
  client: { type: String, default: '' },
  views: { type: String, default: '0' },
  type: { type: String, enum: ['thumbnail', 'video', 'short', 'slider'], default: 'thumbnail' },
  color: { type: String, default: '#0d0f1a' },
  thumbnail: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  link: { type: String, default: '' },
  tag: [{ type: String }],
  duration: { type: String, default: '' },
  featured: { type: Boolean, default: false },
  beforeImage: { type: String, default: '' },
  afterImage: { type: String, default: '' }
}, { timestamps: true });

// Ensure virtual 'id' is included in JSON output for frontend compatibility
workSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    ret.id = ret._id.toString();
    return ret;
  }
});

module.exports = mongoose.model('Work', workSchema);

