import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class TranscribeStack extends cdk.Stack {
  public readonly transcriptionTable: dynamodb.Table;

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

    // Output the table name
    new cdk.CfnOutput(this, "TranscriptionTableName", {
      value: this.transcriptionTable.tableName,
      description: "DynamoDB table name for transcriptions",
    });

    // Add environment tag to all resources
    cdk.Tags.of(this).add("Environment", env);
  }
} 