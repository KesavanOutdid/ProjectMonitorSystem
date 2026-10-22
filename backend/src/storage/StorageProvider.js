/**
 * Abstract Base Class for Storage Providers (Local, AWS S3, Cloudflare R2, etc.)
 */
class StorageProvider {
  /**
   * Upload file to storage destination
   * @param {Object} file - Multer file object
   * @param {string} destinationSubdir - Subfolder or prefix
   * @returns {Promise<{ originalName: string, fileName: string, url: string, storageKey: string, size: number, mimeType: string, storageDriver: string }>}
   */
  async uploadFile(file, destinationSubdir = 'general') {
    throw new Error('Method uploadFile() must be implemented');
  }

  /**
   * Delete file from storage
   * @param {string} storageKey - Key or path of the stored file
   * @returns {Promise<boolean>}
   */
  async deleteFile(storageKey) {
    throw new Error('Method deleteFile() must be implemented');
  }

  /**
   * Get public or signed URL for accessing the file
   * @param {string} storageKey 
   * @returns {string}
   */
  getFileUrl(storageKey) {
    throw new Error('Method getFileUrl() must be implemented');
  }
}

module.exports = StorageProvider;
