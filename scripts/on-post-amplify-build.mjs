#!/usr/bin/env zx
/* eslint-disable no-console */

/* Review the README.md for more info */

import axios from "axios";

import bundleDetails from "../.next/analyze/bundle-details.json";
import amplifyNextjs from "./amplify-nextjs.cjs";

// arn:aws:amplify:us-east-1:{accountId}:apps/{appId}/branches/pr-382
const awsBranchArn = process.env.AWS_BRANCH_ARN;
const awsBranchName = awsBranchArn.substring(
  awsBranchArn.indexOf("branches/") + "branches/".length,
  awsBranchArn.length
);

const lengthOfAwsAccountId = 12;
const accountId = awsBranchArn.substr(
  "aws:arn:amplify:us-east-1:".length,
  lengthOfAwsAccountId
);
// git@github.com:<user-name>/<repo-name>.git
const cloneUrl = process.env.AWS_CLONE_URL;
const githubBranchName = process.env.AWS_BRANCH;
const appId = process.env.AWS_APP_ID;

const repo = cloneUrl.substring(
  "git@github.com:".length,
  cloneUrl.length - ".git".length
);

const isPr = amplifyNextjs.isPr() ? "yes" : "no";
const isRc = amplifyNextjs.isRc() ? "yes" : "no";

const prPreviewDomain = amplifyNextjs.isPr() ? `${appId}.amplifyapp.com` : "";

const body = JSON.stringify({
  event_type: "build_amplify",
  client_payload: {
    app_id: appId,
    aws_account_id: accountId,
    aws_branch: awsBranchName,
    github_branch: githubBranchName,
    pr_preview_domain: prPreviewDomain,
    // Bundle diff
    is_pr: isPr,
    is_rc: isRc,
    // this stringify is required.
    bundle_details: JSON.stringify(bundleDetails),
  },
});

console.log(body);

(async () => {
  try {
    await axios.post(`https://api.github.com/repos/${repo}/dispatches`, body, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      auth: {
        username: process.env.DEVBOT_USERNAME,
        password: process.env.DEVBOT_REPO_PAT,
      },
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
