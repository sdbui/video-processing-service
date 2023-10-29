import express from 'express';

import { 
  uploadProcessedVideo,
  downloadRawVideo,
  deleteRawVideo,
  deleteProcessedVideo,
  convertVideo,
  setupDirectories,
  makeThumbnail,
  uploadThumbnail,
  deleteThumbnail
} from './cloud-storage';
import { isVideoNew, setVideo } from './firestore';

// Create the local directories for videos
setupDirectories();

const app = express();
app.use(express.json());

// Process a video file from Cloud Storage into 360p
app.post('/process-video', async (req, res) => {

  // Get the bucket and filename from the Cloud Pub/Sub message
  let data;
  try {
    const message = Buffer.from(req.body.message.data, 'base64').toString('utf8');
    data = JSON.parse(message);
    if (!data.name) {
      throw new Error('Invalid message payload received.');
    }
  } catch (error) {
    console.error(error);
    return res.status(400).send('Bad Request: missing filename.');
  }

  const inputFileName = data.name;
  const outputFileName = `processed-${inputFileName}`;
  const videoId = inputFileName.split('.')[0];
  const thumbnailName = `${videoId}.png`;
  if (!isVideoNew(videoId)) {
    return res.status(400).send('Bad Request: Video already processing or processed');
  } else {
    await setVideo(videoId, {
      id: videoId,
      uid: videoId.split('-')[0],
      status: 'processing',
    });
  }
  // Download the raw video from Cloud Storage
  await downloadRawVideo(inputFileName);

  // make a thumbnail
  try {
    await makeThumbnail(inputFileName, thumbnailName);
    await uploadThumbnail(thumbnailName);
    await deleteThumbnail(thumbnailName);
  } catch (e) {
    console.log(`Could not make thumbnail: ${e}`)
    await deleteThumbnail(thumbnailName);
  }
  // Process the video into 360p
  try { 
    await convertVideo(inputFileName, outputFileName)
  } catch (err) {
    await Promise.all([
      deleteRawVideo(inputFileName),
      deleteProcessedVideo(outputFileName)
    ]);
    return res.status(500).send('Processing failed');
  }
  
  // Upload the processed video to Cloud Storage
  await uploadProcessedVideo(outputFileName);

  console.log('*** VIDEO PROCESSED ***')
  console.log('attempting to set video with filename:  ', outputFileName)
  await setVideo(videoId, {
    status: 'processed',
    filename: outputFileName,
    thumbnail: thumbnailName
  });

  await Promise.all([
    deleteRawVideo(inputFileName),
    deleteProcessedVideo(outputFileName),
    deleteThumbnail(thumbnailName)
  ]);

  return res.status(200).send('Processing finished successfully');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
