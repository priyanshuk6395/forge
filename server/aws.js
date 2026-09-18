'use strict';

const {
  EC2Client,
  DescribeImagesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateKeyPairCommand,
  RunInstancesCommand,
  DescribeInstancesCommand,
  TerminateInstancesCommand,
} = require('@aws-sdk/client-ec2');

const db = require('./db');
const { decrypt } = require('./crypto');

const CANONICAL_OWNER_ID = '099720109477'; // Canonical's official AMI publisher account
const SG_NAME = 'forge-managed';

function getRegion() {
  return db.get().settings.awsRegion || process.env.AWS_REGION || 'ap-south-1';
}

// Uses explicit keys from Settings if present; otherwise falls back to the
// default provider chain, which picks up an EC2 instance profile automatically
// when Forge itself is running on an EC2 instance with one attached.
function makeClient() {
  const settings = db.get().settings;
  const region = getRegion();
  if (settings.awsAccessKeyIdEnc && settings.awsSecretAccessKeyEnc) {
    return new EC2Client({
      region,
      credentials: {
        accessKeyId: decrypt(settings.awsAccessKeyIdEnc),
        secretAccessKey: decrypt(settings.awsSecretAccessKeyEnc),
      },
    });
  }
  return new EC2Client({ region });
}

async function isConfigured() {
  try {
    const client = makeClient();
    await client.config.credentials();
    return true;
  } catch {
    return false;
  }
}

async function findLatestUbuntuAmi(client) {
  const res = await client.send(
    new DescribeImagesCommand({
      Owners: [CANONICAL_OWNER_ID],
      Filters: [
        { Name: 'name', Values: ['ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*'] },
        { Name: 'state', Values: ['available'] },
        { Name: 'architecture', Values: ['x86_64'] },
      ],
    })
  );
  const images = (res.Images || []).sort((a, b) =>
    a.CreationDate < b.CreationDate ? 1 : -1
  );
  if (!images.length) throw new Error('Could not find an Ubuntu 22.04 AMI in this region.');
  return images[0].ImageId;
}

async function getDefaultNetworking(client) {
  const vpcRes = await client.send(
    new DescribeVpcsCommand({ Filters: [{ Name: 'isDefault', Values: ['true'] }] })
  );
  const vpc = (vpcRes.Vpcs || [])[0];
  if (!vpc) {
    throw new Error(
      'No default VPC found in this region. Create a VPC/subnet first, or connect an existing server instead.'
    );
  }
  const subnetRes = await client.send(
    new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [vpc.VpcId] }] })
  );
  const subnet = (subnetRes.Subnets || [])[0];
  if (!subnet) throw new Error('Default VPC has no subnets.');
  return { vpcId: vpc.VpcId, subnetId: subnet.SubnetId };
}

// Finds or creates the shared "forge-managed" security group, then makes
// sure it allows the ports this deployment needs. Idempotent — safe to call
// on every provision.
async function ensureSecurityGroup(client, vpcId, { sshCidr = '0.0.0.0/0', appPort }) {
  const existing = await client.send(
    new DescribeSecurityGroupsCommand({
      Filters: [
        { Name: 'group-name', Values: [SG_NAME] },
        { Name: 'vpc-id', Values: [vpcId] },
      ],
    })
  );
  let groupId = existing.SecurityGroups && existing.SecurityGroups[0] && existing.SecurityGroups[0].GroupId;

  if (!groupId) {
    const created = await client.send(
      new CreateSecurityGroupCommand({
        GroupName: SG_NAME,
        Description: 'Managed by Forge — SSH + app ports for Forge-connected servers',
        VpcId: vpcId,
      })
    );
    groupId = created.GroupId;
  }

  const wantedPermissions = [
    { proto: 'tcp', port: 22, cidr: sshCidr },
    { proto: 'tcp', port: 80, cidr: '0.0.0.0/0' },
    { proto: 'tcp', port: 443, cidr: '0.0.0.0/0' },
  ];
  if (appPort && appPort !== 80 && appPort !== 443) {
    wantedPermissions.push({ proto: 'tcp', port: appPort, cidr: '0.0.0.0/0' });
  }

  for (const perm of wantedPermissions) {
    try {
      await client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: groupId,
          IpPermissions: [
            {
              IpProtocol: perm.proto,
              FromPort: perm.port,
              ToPort: perm.port,
              IpRanges: [{ CidrIp: perm.cidr, Description: 'forge' }],
            },
          ],
        })
      );
    } catch (e) {
      // InvalidPermission.Duplicate just means the rule already exists.
      if (!String(e.name).includes('Duplicate')) throw e;
    }
  }
  return groupId;
}

async function createKeyPair(client, name) {
  const res = await client.send(
    new CreateKeyPairCommand({ KeyName: name, KeyType: 'ed25519', KeyFormat: 'pem' })
  );
  return { keyName: res.KeyName, privateKey: res.KeyMaterial };
}

async function launchInstance(client, { name, amiId, instanceType, keyName, securityGroupId, subnetId, userData }) {
  const res = await client.send(
    new RunInstancesCommand({
      ImageId: amiId,
      InstanceType: instanceType,
      KeyName: keyName,
      MinCount: 1,
      MaxCount: 1,
      SecurityGroupIds: [securityGroupId],
      SubnetId: subnetId,
      UserData: userData ? Buffer.from(userData, 'utf8').toString('base64') : undefined,
      BlockDeviceMappings: [
        { DeviceName: '/dev/sda1', Ebs: { VolumeSize: 20, VolumeType: 'gp3', Encrypted: true } },
      ],
      MetadataOptions: { HttpTokens: 'required' }, // IMDSv2 only — least-privilege default
      TagSpecifications: [
        { ResourceType: 'instance', Tags: [{ Key: 'Name', Value: name }, { Key: 'ManagedBy', Value: 'forge' }] },
      ],
    })
  );
  return res.Instances[0].InstanceId;
}

async function describeInstance(instanceId) {
  const client = makeClient();
  const res = await client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
  const instance = res.Reservations && res.Reservations[0] && res.Reservations[0].Instances[0];
  if (!instance) return null;
  return {
    state: instance.State.Name,
    publicIp: instance.PublicIpAddress || null,
    publicDns: instance.PublicDnsName || null,
    instanceType: instance.InstanceType,
  };
}

async function waitForRunning(instanceId, { timeoutMs = 3 * 60 * 1000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await describeInstance(instanceId);
    if (info && info.state === 'running' && info.publicIp) return info;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Instance did not reach "running" with a public IP in time.');
}

async function terminateInstance(instanceId) {
  const client = makeClient();
  await client.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
}

// Orchestrates the full "create a new EC2 instance" flow (9.5 Option A).
async function provisionServer({ name, instanceType = 't3.micro', sshCidr, appPort, bootstrapUserData }) {
  const client = makeClient();
  const [amiId, { vpcId, subnetId }] = await Promise.all([
    findLatestUbuntuAmi(client),
    getDefaultNetworking(client),
  ]);
  const securityGroupId = await ensureSecurityGroup(client, vpcId, { sshCidr, appPort });
  const keyName = `forge-${Date.now().toString(36)}`;
  const { privateKey } = await createKeyPair(client, keyName);
  const instanceId = await launchInstance(client, {
    name,
    amiId,
    instanceType,
    keyName,
    securityGroupId,
    subnetId,
    userData: bootstrapUserData,
  });
  const info = await waitForRunning(instanceId);
  return { instanceId, keyName, privateKey, ...info };
}

module.exports = {
  getRegion,
  makeClient,
  isConfigured,
  provisionServer,
  describeInstance,
  terminateInstance,
};
