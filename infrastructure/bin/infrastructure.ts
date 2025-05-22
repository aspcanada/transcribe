#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { TranscribeStack } from "../lib/transcribe-stack";

const app = new cdk.App();

// Get environment from context or default to 'dev'
const env = app.node.tryGetContext("env") || "dev";

// Validate environment
if (!["dev", "staging", "prod"].includes(env)) {
  throw new Error(`Invalid environment: ${env}. Must be one of: dev, staging, prod`);
}

new TranscribeStack(app, `${env}-TranscribeStack`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: `Transcribe application stack for ${env} environment`,
});