const LocalStorageProvider = require('./LocalStorageProvider');
const S3StorageProvider = require('./S3StorageProvider');

let currentProvider = null;

const getStorageProvider = () => {
  if (currentProvider) return currentProvider;

  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

  if (driver === 's3' && process.env.AWS_S3_BUCKET_NAME) {
    currentProvider = new S3StorageProvider();
    console.log('[Storage] Using AWS S3 Storage Provider');
  } else {
    currentProvider = new LocalStorageProvider();
    console.log('[Storage] Using Local Storage Provider (uploads directory)');
  }

  return currentProvider;
};

module.exports = {
  getStorageProvider
};
