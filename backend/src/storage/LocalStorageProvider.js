const fs = require('fs');
const path = require('path');
const StorageProvider = require('./StorageProvider');

class LocalStorageProvider extends StorageProvider {
  constructor() {
    super();
    this.uploadBaseDir = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
    this.ensureDirectoryExists(this.uploadBaseDir);
  }

  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  async uploadFile(file, destinationSubdir = 'general') {
    const targetDir = path.join(this.uploadBaseDir, destinationSubdir);
    this.ensureDirectoryExists(targetDir);

    const ext = path.extname(file.originalname);
    const uniqueFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const targetFilePath = path.join(targetDir, uniqueFileName);

    // If file is in buffer (memory storage) or temp path (disk storage)
    if (file.buffer) {
      fs.writeFileSync(targetFilePath, file.buffer);
    } else if (file.path && fs.existsSync(file.path)) {
      fs.copyFileSync(file.path, targetFilePath);
      try { fs.unlinkSync(file.path); } catch (e) {}
    }

    const storageKey = `${destinationSubdir}/${uniqueFileName}`;
    const url = `/uploads/${storageKey}`;

    return {
      originalName: file.originalname,
      fileName: uniqueFileName,
      url,
      storageKey,
      size: file.size || (fs.existsSync(targetFilePath) ? fs.statSync(targetFilePath).size : 0),
      mimeType: file.mimetype,
      storageDriver: 'local'
    };
  }

  async deleteFile(storageKey) {
    try {
      const filePath = path.join(this.uploadBaseDir, storageKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`[LocalStorageProvider] Failed to delete ${storageKey}:`, err.message);
      return false;
    }
  }

  getFileUrl(storageKey) {
    return `/uploads/${storageKey}`;
  }
}

module.exports = LocalStorageProvider;
