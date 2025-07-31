import * as cdk from 'aws-cdk-lib';
import * as AmplifyHelpers from '@aws-amplify/cli-extensibility-helper';
import { AmplifyDependentResourcesAttributes } from '../../types/amplify-dependent-resources-ref';
import { Construct } from 'constructs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class cdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps, amplifyResourceProps?: AmplifyHelpers.AmplifyResourceProps) {
    super(scope, id, props);
    /* Do not remove - Amplify CLI automatically injects the current deployment environment in this input parameter */
    const env = new cdk.CfnParameter(this, 'env', {
      type: 'String',
      description: 'Current Amplify CLI env name',
    });
    /* AWS CDK code goes here - learn more: https://docs.aws.amazon.com/cdk/latest/guide/home.html */
    
    const bucket = new Bucket(this, `custom-bucket-for-${env.valueAsString}`)

    // Create Lambda function
    const addFileLambda = new lambda.Function(this, 'AddFileLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3();
        
        exports.handler = async () => {
          const params = {
            Bucket: '${bucket.bucketName}',
            Key: \`file-\${Date.now()}.txt\`,
            Body: 'Hello from Lambda! (env: ${process.env.ENV_NAME})'
          };
          
          await s3.putObject(params).promise();
        };
      `),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        ENV_NAME: env.valueAsString,
      }
    });

    // Grant S3 permissions to Lambda
    bucket.grantWrite(addFileLambda);

    // Create EventBridge rule to trigger Lambda every 5 minutes
    new events.Rule(this, 'ScheduleRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(addFileLambda)]
    });
  }
}