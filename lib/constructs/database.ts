import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface DatabaseProps {
  serviceName: string;
  area: string;
  globalDatabaseIdentifier: string;
  isPrimaryDatabaseCluster: boolean;
  vpc: cdk.aws_ec2.IVpc;
  privateSubnets: cdk.aws_ec2.SubnetSelection;
  isolatedSubnets: cdk.aws_ec2.SubnetSelection;
}

export class Database extends Construct {
  readonly dbCluster: cdk.aws_rds.DatabaseCluster;
  readonly dbListenerPort: number;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    // Database engine
    const mysqlEngine = cdk.aws_rds.DatabaseClusterEngine.auroraMysql({
      version: cdk.aws_rds.AuroraMysqlEngineVersion.VER_3_04_1,
    });

    // Database cluster parameter group
    const dbClusterParameterGroup = new cdk.aws_rds.ParameterGroup(this, "DBClusterParameterGroup", {
      engine: mysqlEngine,
      description: `Cluster parameter group for ${props.serviceName}-${props.area}`,
      parameters: {
        slow_query_log: "1",
      },
    });
    dbClusterParameterGroup.bindToCluster({});
    (
      dbClusterParameterGroup.node.defaultChild as cdk.aws_rds.CfnDBClusterParameterGroup
    ).dbClusterParameterGroupName = `${props.serviceName}-${props.area}-db-cluster-pg-aurora-mysql8`;

    // Database instance parameter group
    const dbInstanceParameterGroup = new cdk.aws_rds.ParameterGroup(this, "DBInstanceParameterGroup", {
      engine: mysqlEngine,
      description: `Instance parameter group for ${props.serviceName}-${props.area}`,
    });
    dbInstanceParameterGroup.bindToInstance({});
    (
      dbInstanceParameterGroup.node.defaultChild as cdk.aws_rds.CfnDBParameterGroup
    ).dbParameterGroupName = `${props.serviceName}-${props.area}-db-instance-pg-aurora-mysql8`;

    // Database subnet group
    const dbSubnetGroup = new cdk.aws_rds.SubnetGroup(this, "DBSubnetGroup", {
      subnetGroupName: `${props.serviceName}-${props.area}-db-subnet-group`,
      description: `${props.serviceName}-${props.area}-db-subnet-group`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpc: props.vpc,
      vpcSubnets: props.isolatedSubnets,
    });

    // Database security group
    const dbSecurityGroupName = `${props.serviceName}-${props.area}-db-security-group`;
    const dbSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, "DBSecurityGroup", {
      securityGroupName: dbSecurityGroupName,
      description: dbSecurityGroupName,
      vpc: props.vpc,
      allowAllOutbound: false,
    });
    cdk.Tags.of(dbSecurityGroup).add("Name", dbSecurityGroupName);

    // Database credential
    const dbSecretExcludeCharacters = " % +~`#$&*()|[]{}:;<>?!'/@\"\\";
    const dbSecret = new cdk.aws_secretsmanager.Secret(this, "DBSecret", {
      secretName: `${props.serviceName}-${props.area}-db-secret`,
      description: `Credentials for ${props.serviceName}-${props.area} database`,
      generateSecretString: {
        generateStringKey: "password",
        excludeCharacters: dbSecretExcludeCharacters,
        passwordLength: 30,
        secretStringTemplate: JSON.stringify({ username: "admin" }),
      },
    });

    // Database monitoring role
    const monitoringRole = new cdk.aws_iam.Role(this, "MonitoringRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("monitoring.rds.amazonaws.com"),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonRDSEnhancedMonitoringRole"),
      ],
    });

    // Database cluster
    this.dbCluster = new cdk.aws_rds.DatabaseCluster(this, "DBCluster", {
      engine: mysqlEngine,
      clusterIdentifier: `${props.serviceName}-${props.area}-db-cluster`,
      defaultDatabaseName: props.serviceName,
      writer: cdk.aws_rds.ClusterInstance.serverlessV2("WriterInstance", {
        instanceIdentifier: `${props.serviceName}-${props.area}-db-instance-writer`,
        parameterGroup: dbInstanceParameterGroup,
        enablePerformanceInsights: true,
        allowMajorVersionUpgrade: false,
        autoMinorVersionUpgrade: true,
        performanceInsightRetention: cdk.aws_rds.PerformanceInsightRetention.DEFAULT,
        publiclyAccessible: false,
      }),
      readers: [
        cdk.aws_rds.ClusterInstance.serverlessV2("ReaderInstance", {
          instanceIdentifier: `${props.serviceName}-${props.area}-db-instance-reader`,
          parameterGroup: dbInstanceParameterGroup,
          enablePerformanceInsights: true,
          allowMajorVersionUpgrade: false,
          autoMinorVersionUpgrade: true,
          performanceInsightRetention: cdk.aws_rds.PerformanceInsightRetention.DEFAULT,
          publiclyAccessible: false,
          scaleWithWriter: true,
        }),
      ],
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2.0,
      subnetGroup: dbSubnetGroup,
      parameterGroup: dbClusterParameterGroup,
      vpc: props.vpc,
      vpcSubnets: props.isolatedSubnets,
      securityGroups: [dbSecurityGroup],
      credentials: cdk.aws_rds.Credentials.fromSecret(dbSecret),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      iamAuthentication: false,
      monitoringRole: monitoringRole,
      backup: {
        retention: cdk.Duration.days(7),
        preferredWindow: "17:00-17:30",
      },
      monitoringInterval: cdk.Duration.minutes(1),
      preferredMaintenanceWindow: "Sat:18:00-Sat:18:30",
      storageEncrypted: true,
      storageEncryptionKey: cdk.aws_kms.Alias.fromAliasName(this, "EncriptionKey", "alias/aws/rds"),
      copyTagsToSnapshot: true,
      cloudwatchLogsExports: ["error", "general", "slowquery", "audit"],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_DAY,
    });
    this.dbListenerPort = 3306;
    this.dbCluster.connections.allowInternally(
      cdk.aws_ec2.Port.tcp(this.dbListenerPort),
      `Allow access to database from internal resources on port ${this.dbListenerPort}`
    );
    this.dbCluster.connections.allowFrom(
      cdk.aws_ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      cdk.aws_ec2.Port.tcp(this.dbListenerPort),
      `Allow access to database from VPC resources on port ${this.dbListenerPort}`
    );

    // Global Database
    if (props.isPrimaryDatabaseCluster) {
      new cdk.aws_rds.CfnGlobalCluster(this, "GlobalDatabase", {
        globalClusterIdentifier: props.globalDatabaseIdentifier,
        sourceDbClusterIdentifier: this.dbCluster.clusterIdentifier,
        deletionProtection: false,
      });
    } else {
      const cfnDbCluster = this.dbCluster.node.defaultChild as cdk.aws_rds.CfnDBCluster;
      cfnDbCluster.globalClusterIdentifier = props.globalDatabaseIdentifier;
      cfnDbCluster.databaseName = undefined;
      cfnDbCluster.addPropertyDeletionOverride("MasterUsername");
      cfnDbCluster.addPropertyDeletionOverride("MasterUserPassword");
      this.dbCluster.node.tryRemoveChild("Secret");
    }
  }
}
