import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";

export class TranscribeStack extends cdk.Stack {
  public readonly transcriptionTable: dynamodb.Table;
  public readonly audioBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Extract environment from stack name
    const env = id.split("-")[0];

    // Create DynamoDB table for transcriptions
    this.transcriptionTable = new dynamodb.Table(this, "TranscriptionTable", {
      tableName: `${env}-transcriptions`,
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "fileHash", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: env === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
    });

    // Add GSI for querying by creation date
    this.transcriptionTable.addGlobalSecondaryIndex({
      indexName: "CreatedAtIndex",
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create S3 bucket for audio files
    this.audioBucket = new s3.Bucket(this, "AudioBucket", {
      bucketName: `${env}-transcribe-audio-${this.account}`,
      removalPolicy: env === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: env !== "prod", // Only auto-delete in non-prod environments
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: env === "prod" ? ["https://yourdomain.com"] : ["*"], // Restrict in prod
          allowedHeaders: ["*"],
        },
      ],
    });

    // Create IAM role for Transcribe service
    const transcribeRole = new iam.Role(this, "TranscribeServiceRole", {
      roleName: `${env}-transcribe-service-role`,
      assumedBy: new iam.ServicePrincipal("transcribe.amazonaws.com"),
    });

    // Add permissions for Transcribe to access S3
    transcribeRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject",
          "s3:ListBucket",
        ],
        resources: [
          this.audioBucket.bucketArn,
          `${this.audioBucket.bucketArn}/*`,
        ],
      })
    );

    // Output the table name and bucket name
    new cdk.CfnOutput(this, "TranscriptionTableName", {
      value: this.transcriptionTable.tableName,
      description: "DynamoDB table name for transcriptions",
    });

    new cdk.CfnOutput(this, "AudioBucketName", {
      value: this.audioBucket.bucketName,
      description: "S3 bucket name for audio files",
    });

    // Add environment tag to all resources
    cdk.Tags.of(this).add("Environment", env);
  }
} 