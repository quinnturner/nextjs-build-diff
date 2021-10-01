#!/usr/bin/env zx
// @ts-check
/* eslint-disable no-console */

/**
 * Required env: AMPLIFY_APP_ID, AWS_BRANCH_NAME (likely "pr-{PR#}")
 *
 * Logic:
 * 1. We need to get the CloudFront ID. To do that, we access the logs based on the branch and app.
 * 2. We disable the CloudFront distribution
 * 3. We delete the CloudFront distribution
 */

import { writeFile } from "fs/promises";
import { $ } from "zx";

/**
 * Required env: AWS_ACCOUNT_ID, AMPLIFY_APP_ID, AWS_BRANCH_NAME (likely "pr-{PR#}")
 */

const awsAccountId = process.env.AWS_ACCOUNT_ID;
const appId = process.env.AMPLIFY_APP_ID;
const awsBranch = process.env.AWS_BRANCH_NAME;

if (!awsAccountId) {
  throw new Error("Missing env var: AWS_ACCOUNT_ID");
}
if (!appId) {
  throw new Error("Missing env var: AMPLIFY_APP_ID");
}
if (!awsBranch) {
  throw new Error("Missing env var: AWS_BRANCH_NAME");
}
/** @type {number} */
let scriptStartTime;

function hasMaxDeploymentTimePassed() {
  const secondsSinceStart = (new Date().getTime() - scriptStartTime) / 1000;
  return secondsSinceStart > 60 * 3; // 3 mins timeout after the initial sleep
}

/**
 *
 * @returns {Promise<string | undefined>}
 */
async function getLogUrl() {
  await sleep(8 * 1000);
  const { jobSummaries } = JSON.parse(
    (
      await $`aws amplify list-jobs --app-id ${appId} --branch-name ${awsBranch}`
    ).stdout
  );
  const jobDetails = jobSummaries.find((j) => j.status === "SUCCEED");

  const recursiveReturn = () =>
    hasMaxDeploymentTimePassed() ? undefined : getLogUrl();

  if (!jobDetails) {
    return recursiveReturn();
  }
  const { jobId } = jobDetails;
  let getJobResult;
  try {
    getJobResult = JSON.parse(
      (
        await $`aws amplify get-job --app-id ${appId} --branch-name ${awsBranch} --job-id ${jobId}`
      ).stdout
    );
  } catch (err) {
    return recursiveReturn();
  }
  const jobStep = getJobResult.job.steps.find(
    (step) => step.stepName === "DEPLOY"
  );
  if (jobStep && jobStep.logUrl) {
    return jobStep.logUrl;
  }
  return recursiveReturn();
}

/**
 * @param {any | null} val
 * @returns {string | null}
 */
function trim(val) {
  if (!val) return val;
  const result = val.stdout.trim();
  return result ? result : null;
}

(async () => {
  // Step 1 - Get the CloudFront id
  // It always take 1m45s (+8s inside the function call) before trying
  await sleep(1.75 * 60 * 1000);
  scriptStartTime = new Date().getTime();
  const logUrl = await getLogUrl();
  if (!logUrl) {
    throw new Error("Log not found");
  }
  /*
2021-08-09T20:45:56 [INFO]: Starting Deployment
2021-08-09T20:45:56 [INFO]: Updating Edge config
buildId 0000000038
2021-08-09T20:45:57 [INFO]: Deploying SSR Resources. Distribution ID: E3K99JYPICC5AM. This may take a few minutes...
2021-08-09T20:45:57 [INFO]: Deployed the following resources to your account:
2021-08-09T20:45:57 [INFO]: - CloudFront Domain ID: dcmrqll5onwaq
2021-08-09T20:45:57 [INFO]: - SSR Lambda@Edge: xrpzjukr-g2qb37
2021-08-09T20:45:57 [INFO]: - Image Optimization Lambda@Edge: xrpzjukr-v6m87xf
2021-08-09T20:45:57 [INFO]: - ISR Lambda: xrpzjukr-uurw6df
2021-08-09T20:45:57 [INFO]: - ISR SQS Queue: xrpzjukr-uurw6df.fifo
2021-08-09T20:45:57 [INFO]: - S3 Bucket: xrpzjukr-uurw6df
2021-08-09T20:45:57 [INFO]: SSR Deployment complete
    */
  const logResult = await fetch(logUrl);
  const logs = await logResult.text();

  // Due to how zx works, I wasn't able make these into functions.
  // If you can figure out, please do it!
  const [
    cloudfrontId,
    ssrLambdaId,
    imageLambdaId,
    isrLambda,
    isrSqsQueue,
    bucketId,
  ] = await Promise.all([
    // The first sed gets "E3K99JYPICC5AM.", the cut trims everything including and right of the first "."
    $`echo ${logs} | sed -n -e 's/^.*Distribution ID: //p' | cut -f1 -d.`.catch(
      () => null
    ),
    $`echo ${logs} | grep -o 'SSR Lambda@Edge:.*' | cut -f2- -d:`.catch(
      () => null
    ),
    $`echo ${logs} | grep -o 'Optimization Lambda@Edge:.*' | cut -f2- -d:`.catch(
      () => null
    ),
    $`echo ${logs} | grep -o 'ISR Lambda:.*' | cut -f2- -d:`.catch(() => null),
    $`echo ${logs} | grep -o 'ISR SQS Queue:.*' | cut -f2- -d:`.catch(
      () => null
    ),
    $`echo ${logs} | grep -o 'Bucket:.*' | cut -f2- -d:`.catch(() => null),
  ]).then((results) => results.map(trim));

  const resourcePrefix = bucketId.substr(0, bucketId.indexOf("-"));
  /** @type {string[]} */
  const iamRoles =
    await $`aws iam list-roles --query 'Roles[?contains(RoleName, \`${resourcePrefix}\`)].RoleName'`
      .then((output) => output.toString())
      .then(JSON.parse)
      .catch(() => []);

  const details = JSON.stringify(
    {
      awsAccountId,
      awsBranch,
      appId,
      cloudfrontId,
      ssrLambdaId,
      imageLambdaId,
      isrLambda,
      isrSqsQueue,
      bucketId,
      iamRoles,
    },
    null,
    2
  );
  const fileDir = "./tmp";
  await fs.access(fileDir).catch(() => fs.mkdir(fileDir, { recursive: true }));
  await writeFile(`${fileDir}/amplify-details.json`, details, {
    encoding: "utf-8",
    flag: "w",
  });
})()
  .then(() => {
    console.log("Done!");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
