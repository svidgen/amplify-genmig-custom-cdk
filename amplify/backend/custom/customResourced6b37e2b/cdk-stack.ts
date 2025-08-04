import * as cdk from "aws-cdk-lib";
import * as AmplifyHelpers from "@aws-amplify/cli-extensibility-helper";
import { AmplifyDependentResourcesAttributes } from "../../types/amplify-dependent-resources-ref";
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";

export class cdkStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: cdk.StackProps,
    amplifyResourceProps?: AmplifyHelpers.AmplifyResourceProps
  ) {
    super(scope, id, props);
    /* Do not remove - Amplify CLI automatically injects the current deployment environment in this input parameter */
    const env = new cdk.CfnParameter(this, "env", {
      type: "String",
      description: "Current Amplify CLI env name",
    });
    /* AWS CDK code goes here - learn more: https://docs.aws.amazon.com/cdk/latest/guide/home.html */

    const bucket = new Bucket(this, `custom-bucket`);

    const isProd = new cdk.CfnCondition(this, "IsProd", {
      expression: cdk.Fn.conditionEquals(env.valueAsString, "prod"),
    });

    const isDev = new cdk.CfnCondition(this, "IsDev", {
      expression: cdk.Fn.conditionNot(isProd),
    });

    // Create Lambda function
    const addFileLambda = new lambda.Function(this, "AddFileLambda", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
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
      },
    });

    // Grant S3 permissions to Lambda
    bucket.grantWrite(addFileLambda);
    this.emitCfnTypeConditionalResources(addFileLambda, isProd, isDev);
    this.emitBuildTimeConditionalResources();
  }

  /**
   * Example conditional infra using Cloudformation template conditions.
   * 
   * @param f 
   * @param isProd 
   * @param isDev 
   */
  emitCfnTypeConditionalResources(
    f: lambda.Function,
    isProd: cdk.CfnCondition,
    isDev: cdk.CfnCondition,
  ) {
    const prodSchedule = new events.CfnRule(this, "ScheduleRuleProd", {
      scheduleExpression: "rate(60 minutes)",
      state: "ENABLED",
      targets: [
        {
          id: "TargetProd",
          arn: f.functionArn,
        },
      ],
    });
    prodSchedule.cfnOptions.condition = isProd;

    // Add Lambda permission for EventBridge to invoke function in prod
    const prodScheduleLambdaPerms = new lambda.CfnPermission(
      this,
      "ScheduleRuleProdLambdaPerms",
      {
        action: "lambda:InvokeFunction",
        functionName: f.functionName,
        principal: "events.amazonaws.com",
        sourceArn: prodSchedule.attrArn,
      }
    );
    prodScheduleLambdaPerms.cfnOptions.condition = isProd;

    const devSchedule = new events.CfnRule(this, "ScheduleRuleDev", {
      scheduleExpression: "rate(5 minutes)",
      state: "ENABLED",
      targets: [
        {
          id: "TargetDev",
          arn: f.functionArn,
        },
      ],
    });
    devSchedule.cfnOptions.condition = isDev;

    // Add Lambda permission for EventBridge to invoke function in prod
    const devScheduleLambdaPerms = new lambda.CfnPermission(
      this,
      "ScheduleRuleDevLambdaPerms",
      {
        action: "lambda:InvokeFunction",
        functionName: f.functionName,
        principal: "events.amazonaws.com",
        sourceArn: devSchedule.attrArn,
      }
    );
    devScheduleLambdaPerms.cfnOptions.condition = isDev;
  }

  /**
   * Example conditional infra that is known only at synthesis time. I.e., Cloudformation
   * won't have any idea there's a condition tied to this infrastructure.
   */
  emitBuildTimeConditionalResources() {
    if (process.env['USER'] === 'wirej') {
      const bucket = new Bucket(this, `bucket-user-wirej`);
    } else {
      const bucket = new Bucket(this, `bucket-user-other`);
    }
  }
}
