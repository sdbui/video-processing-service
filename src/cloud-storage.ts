import { Storage } from "@google-cloud/storage";
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

const storage = new Storage();

const rawVideoBucketName = "buitube-raw-videos";
const processedVideoBucketName = "buitube-processed-videos";
const thumbnailsBucketName = "buitube-video-thumbnails";

const localRawVideoPath = "./raw-videos";
const localProcessedVideoPath = "./processed-videos";
const localThumbnailPath = './thumbnails'

/**
 * Creates the local directories for raw and processed videos.
 */
export function setupDirectories() {
  ensureDirectoryExistence(localRawVideoPath);
  ensureDirectoryExistence(localProcessedVideoPath);
  ensureDirectoryExistence(localThumbnailPath);
}


export function makeThumbnail (videoName: string, thumbnailName: string) {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(`${localRawVideoPath}/${videoName}`)
    .outputOptions('-ss', '00:00:03')
    .outputOptions('-frames:v 1')
    .output(`${localThumbnailPath}/${thumbnailName}`)
    .on('end', resolve)
    .on('error', reject)
    .run()
  });
}

export async function uploadThumbnail (thumbnailName: string) {
  const thumbnailBucket = storage.bucket(thumbnailsBucketName);
  await thumbnailBucket
    .upload(`${localThumbnailPath}/${thumbnailName}`, {
      destination: thumbnailName
    });
    console.log(
      `${localThumbnailPath}/${thumbnailName} uploaded to gs://${thumbnailsBucketName}/${thumbnailName}.`
    );

    // Set the video to be publicly readable
    await thumbnailBucket.file(thumbnailName).makePublic();
}


/**
 * @param rawVideoName - The name of the file to convert from {@link localRawVideoPath}.
 * @param processedVideoName - The name of the file to convert to {@link localProcessedVideoPath}.
 * @returns A promise that resolves when the video has been converted.
 */
// todo... fix the resizing logic lmao
export function convertVideo(rawVideoName: string, processedVideoName: string) {
  return new Promise<void>((resolve, reject) => {

    ffmpeg(`${localRawVideoPath}/${rawVideoName}`).ffprobe((err, data) => {
      const height = data.streams[0].height || 0;
      let command = ffmpeg(`${localRawVideoPath}/${rawVideoName}`)
        .videoCodec('libx264')
        .outputOptions('-vf', 'format=yuv420p')
        .on('end', () => {
          resolve();
        })
        .on('error', (e: any) => {
          console.log(`An Error occured: ${e.message}`)
          reject(e);
        });
      if (height > 720) {
        command.size('?x720'); // resize to 720p if larger
      }
      command.save(`${localProcessedVideoPath}/${processedVideoName}`);
    })
  });
}


/**
 * @param fileName - The name of the file to download from the 
 * {@link rawVideoBucketName} bucket into the {@link localRawVideoPath} folder.
 * @returns A promise that resolves when the file has been downloaded.
 */
export async function downloadRawVideo(fileName: string) {
  await storage.bucket(rawVideoBucketName)
    .file(fileName)
    .download({
      destination: `${localRawVideoPath}/${fileName}`,
    });

  console.log(
    `gs://${rawVideoBucketName}/${fileName} downloaded to ${localRawVideoPath}/${fileName}.`
  );
}


/**
 * @param fileName - The name of the file to upload from the 
 * {@link localProcessedVideoPath} folder into the {@link processedVideoBucketName}.
 * @returns A promise that resolves when the file has been uploaded.
 */
export async function uploadProcessedVideo(fileName: string) {
  const bucket = storage.bucket(processedVideoBucketName);

  // Upload video to the bucket
  await storage.bucket(processedVideoBucketName)
    .upload(`${localProcessedVideoPath}/${fileName}`, {
      destination: fileName,
    });
  console.log(
    `${localProcessedVideoPath}/${fileName} uploaded to gs://${processedVideoBucketName}/${fileName}.`
  );

  // Set the video to be publicly readable
  await bucket.file(fileName).makePublic();
}


/**
 * @param fileName - The name of the file to delete from the
 * {@link localRawVideoPath} folder.
 * @returns A promise that resolves when the file has been deleted.
 * 
 */
export function deleteRawVideo(fileName: string) {
  return deleteFile(`${localRawVideoPath}/${fileName}`);
}


/**
* @param fileName - The name of the file to delete from the
* {@link localProcessedVideoPath} folder.
* @returns A promise that resolves when the file has been deleted.
* 
*/
export function deleteProcessedVideo(fileName: string) {
  return deleteFile(`${localProcessedVideoPath}/${fileName}`);
}


/**
 * 
 * @param fileName The name of the file to delete from the
 * {@link localThumbnailPath} folder
 * @returns a promise that resolves when file is deleted
 */
export function deleteThumbnail(fileName: string) {
  return deleteFile(`${localThumbnailPath}/${fileName}`);
}


/**
 * @param filePath - The path of the file to delete.
 * @returns A promise that resolves when the file has been deleted.
 */
function deleteFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`Failed to delete file at ${filePath}`, err);
          reject(err);
        } else {
          console.log(`File deleted at ${filePath}`);
          resolve();
        }
      });
    } else {
      console.log(`File not found at ${filePath}, skipping delete.`);
      resolve();
    }
  });
}


/**
 * Ensures a directory exists, creating it if necessary.
 * @param {string} dirPath - The directory path to check.
 */
function ensureDirectoryExistence(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true }); // recursive: true enables creating nested directories
    console.log(`Directory created at ${dirPath}`);
  }
}