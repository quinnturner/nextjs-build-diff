#!/usr/bin/env zx
// @ts-check
/* eslint-disable no-console */

import { readFile, writeFile } from "fs/promises";
import { $ } from "zx";

/**
 * @param {string} cloudfrontId
 */
async function disableAndDeleteCloudFrontDistribution(cloudfrontId) {
  // Step 2 - Disable the distribution
  const { ETag, ...distribution } = JSON.parse(
    (await $`aws cloudfront get-distribution --id ${cloudfrontId}`).stdout
  );
  // Sanity check to ensure that we didn't find a CF distribution that we shouldn't have
  const cacheBehaviors =
    distribution.Distribution.DistributionConfig.CacheBehaviors;
  if (!cacheBehaviors.Items.some((c) => c.PathPattern === "_next/static/*")) {
    throw new Error(
      "Non-Next.js CloudFront distribution found (this should be investigated ASAP)"
    );
  }

  distribution.Distribution.DistributionConfig.Enabled = false;
  await writeFile(
    "./temp-cloudfront.json",
    JSON.stringify(distribution.Distribution.DistributionConfig),
    {
      encoding: "utf-8",
      flag: "w",
    }
  );
  await $`aws cloudfront update-distribution --id ${cloudfrontId} --if-match ${ETag} --distribution-config file://temp-cloudfront.json`;
  // Step 3 - delete distribution
  // Unfortunately, we will have to poll to know when the distribution is disabled

  // Wait around for a bit over 2 mins
  await sleep(1000 * 60 * 2.2);

  let totalTime = 0;
  const startingTime = new Date().getTime();
  let deleted = false;
  do {
    const disabledDistribution = JSON.parse(
      (await $`aws cloudfront get-distribution --id ${cloudfrontId}`).stdout
    );
    if (
      disabledDistribution.Distribution.Status === "Deployed" &&
      disabledDistribution.Distribution.DistributionConfig.Enabled === false
    ) {
      await $`aws cloudfront delete-distribution --id ${cloudfrontId} --if-match ${disabledDistribution.ETag}`;
      deleted = true;
      break;
    }
    totalTime += new Date().getTime() - startingTime;
    await sleep(1000 * 10);
  } while (totalTime < 1000 * 60 * 5);
  if (!deleted) {
    console.warn(`Did not delete distribution ${cloudfrontId}`);
  }
}

/**
 * @param {string} bucketId
 */
function deleteBucket(bucketId) {
  // By default, the bucket must be empty for the operation to succeed.
  // To remove a bucket that's not empty, you need to include the --force option.
  // The following example deletes all objects and prefixes in the bucket, and then deletes the bucket.
  return $`aws s3 rb s3://${bucketId} --force`;
}

/**
 * @param {string} awsAccountId
 * @param {string} queueId
 */
function deleteSqsQueue(awsAccountId, queueId) {
  return $`aws sqs delete-queue --queue-url https://sqs.us-east-1.amazonaws.com/${awsAccountId}/${queueId}`;
}

/**
 *
 * @param {string} lambdaId
 */
function deleteLambda(lambdaId) {
  return $`aws lambda delete-function --function-name ${lambdaId}`;
}

/**
 *
 * @param {string} roleName
 */
function deleteIamRole(roleName) {
  return $`aws iam delete-role --role-name ${roleName}`;
}

const fileName = "comment-body.json";

(async () => {
  /** @type {string} */
  let commentBody;
  try {
    commentBody = await readFile(fileName, {
      encoding: "utf-8",
    });
  } catch {
    console.warn(
      `${fileName} is not accessible, the PR probably merged. Exiting normally.`
    );
    return;
  }

  /**
   * @type {{
   *     awsBranch: string,
   *     appId: string,
   *     awsAccountId: string,
   *     branchName: string,
   *     bucketId: string | null,
   *     cloudfrontId: string | null,
   *     imageLambdaId: string | null,
   *     isrLambda: string | null,
   *     isrSqsQueue: string | null,
   *     ssrLambdaId: string | null,
   *     iamRoles: string[],
   *   }}
   */
  const {
    awsAccountId,
    bucketId,
    cloudfrontId,
    imageLambdaId,
    isrLambda,
    isrSqsQueue,
    ssrLambdaId,
    iamRoles,
  } = JSON.parse(commentBody);

  const cfPromise = cloudfrontId
    ? disableAndDeleteCloudFrontDistribution(cloudfrontId)
        .then(() => {
          console.log(
            `Successfully deleted CloudFront distribution ${cloudfrontId}`
          );
        })
        .catch((err) => {
          console.error(
            `Failed to disable/delete CloudFront distribution ${cloudfrontId}`
          );
          console.error(err);
        })
    : Promise.resolve().then(() => {
        console.warn(`CloudFront ID not provided`);
      });
  const isrSqsQueuePromise = isrSqsQueue
    ? deleteSqsQueue(awsAccountId, isrSqsQueue)
        .then(() => {
          console.log(`Successfully deleted ISR SQS Queue ${isrSqsQueue}`);
        })
        .catch((err) => {
          console.error(`Failed to delete ISR SQS Queue ${isrSqsQueue}`);
          console.error(err);
        })
    : Promise.resolve().then(() => {
        console.warn(`ISR SQS Queue ID not provided`);
      });
  const bucketPromise = bucketId
    ? deleteBucket(bucketId)
        .then(() => {
          console.log(`Successfully deleted bucket ${bucketId}`);
        })
        .catch((err) => {
          console.error(`Failed to delete bucket ${bucketId}`);
          console.error(err);
        })
    : Promise.resolve().then(() => {
        console.warn(`Bucket ID not provided`);
      });

  // `allSettled` instead of `all` because we want to delete as many resources as we can.
  // Failing to delete an SQS instance should not impact deleting a CF distribution.
  const result1 = await Promise.allSettled([
    bucketPromise,
    cfPromise,
    isrSqsQueuePromise,
  ]);

  const isrLambdaPromise = isrLambda
    ? deleteLambda(isrLambda)
        .then(() => {
          console.log(`Successfully deleted ISR Lambda ${isrLambda}`);
        })
        .catch((err) => {
          console.error(`Failed to delete ISR Lambda ${isrLambda}`);
          console.error(err);
        })
    : Promise.resolve().then(() => {
        console.warn(`ISR SQS Lambda ID not provided`);
      });

  const result2 = await Promise.allSettled([isrLambdaPromise]);

  const iamRolePromises = iamRoles.map((role) =>
    deleteIamRole(role)
      .then(() => {
        console.log(`Successfully deleted iam role ${role}`);
      })
      .catch((err) => {
        console.error(`Failed to iam role ${role}`);
        console.error(err);
      })
  );

  const result3 = await Promise.allSettled([...iamRolePromises]);

  return [...result1, ...result2, ...result3];
})()
  .then(() => {
    console.log("Done!");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
