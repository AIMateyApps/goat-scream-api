const path = require('path');
const { uploadAudio, renameAsset, deleteAsset } = require('./cloudinary');

const SUBMISSION_PREFIX = 'goat-screams/submissions';
const MAIN_PREFIX = 'goat-screams/audio';

async function uploadSubmissionAudio(filePath, submissionId, { tags = [], context = {} } = {}) {
  const publicId = path.posix.join(SUBMISSION_PREFIX, submissionId);
  const result = await uploadAudio(filePath, { publicId, tags: ['submission', ...tags], context });
  return {
    publicId: result.public_id,
    url: result.secure_url || result.url,
    duration: result.duration,
    bytes: result.bytes,
    format: result.format,
  };
}

async function promoteSubmissionAudio(publicId, goatScreamId) {
  const targetPublicId = path.posix.join(MAIN_PREFIX, goatScreamId);
  const result = await renameAsset(publicId, targetPublicId);
  return {
    publicId: result.public_id,
    url: result.secure_url || result.url,
  };
}

async function deleteSubmissionAudio(publicId) {
  if (!publicId) return null;
  return deleteAsset(publicId);
}

module.exports = {
  uploadSubmissionAudio,
  promoteSubmissionAudio,
  deleteSubmissionAudio,
};
