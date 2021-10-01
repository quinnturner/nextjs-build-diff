# Scripts

## Amplify + GitHub

Amplify does not delete resources when a PR is merged.
Specifically, it does not delete the cloudfront distribution, the S3 bucket, the image lambda, and the SSR lambda.
We do not want loose resources especially considering we are hitting limits on S3 buckets and CF distributions.

Therefore, intuitively, once we have merged a PR we want to find the resources that are loose and remove them.

While that sounds straightforward, it's not.

If we only listen to the GitHub PR closed event in a GitHub Action and try and find the resources
based on the branch name, the branch will have already been deleted on Amplify.
Amplify breaks the ability to find the underlying resources related to a branch once it's been merged.

Therefore, we have to find them as soon as they are created, record them, then delete them when we are done with them.

To do that, we use the `postBuild` event on Amplify (defined in [../amplify.yml](../amplify.yml) and [./on-post-amplify-build.mjs](./on-post-amplify-build.mjs)) to notify a GitHub Action that a build is complete.
Unfortunately, it's a `postBuild` event and not a `postDeploy` event; and Amplify's `postBuild` does not
have context of the resources the build is deployed. So once Amplify notifies GitHub that the build is complete (handled in [`.github/workflows/on-amplify-post-build.yml](../.github/workflows/on-amplify-post-build.yml)),
the GitHub Action must query AWS for the resource in [./on-post-amplify-build.mjs](./on-post-amplify-build.mjs).
The Action saves the result of the queries to a GitHub Comment on the associated PR.

On a PR closed event, the GitHub Action
[`.github/workflows/amplify-cleanup.yml](../.github/workflows/amplify-cleanup.yml)
reads the GitHub Comment for the details on what resources can be deleted.
It then deletes the resources.
