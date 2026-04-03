import * as Minio from 'minio';

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: 'admin',
  secretKey: 'gitlawb_secret',
});

export async function uploadToMinio(bucketName: string, objectName: string, filePath: string) {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) await minioClient.makeBucket(bucketName);
    await minioClient.fPutObject(bucketName, objectName, filePath);
    return `✅ Object ${objectName} uploaded to ${bucketName}`;
  } catch (err: any) {
    throw new Error(`MinIO Upload Error: ${err.message}`);
  }
}

export async function getFromMinio(bucketName: string, objectName: string): Promise<string> {
  try {
    const stream = await minioClient.getObject(bucketName, objectName);
    return new Promise((resolve, reject) => {
      let data = '';
      stream.on('data', chunk => data += chunk);
      stream.on('end', () => resolve(data));
      stream.on('error', err => reject(err));
    });
  } catch (err: any) {
    throw new Error(`MinIO Download Error: ${err.message}`);
  }
}
