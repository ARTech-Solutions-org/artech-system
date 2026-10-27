import { config } from "dotenv";
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: ".env.local" });

const account = process.env.R2_ACCOUNT_ID;
const key = process.env.R2_ACCESS_KEY_ID;
const secret = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const origin = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

if (!account || !key || !secret || !bucket) {
  throw new Error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in .env.local");
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${account}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: key, secretAccessKey: secret },
});

async function main() {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [origin, "http://localhost:3000"],
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "Content-Length"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log(`CORS on bucket "${bucket}" allows PUT/GET from ${origin}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
