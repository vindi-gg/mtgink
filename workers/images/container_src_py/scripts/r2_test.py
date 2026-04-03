"""Minimal R2 upload test from inside container."""
import os
import boto3
from botocore.config import Config

endpoint = os.environ.get("R2_ENDPOINT", "")
key_id = os.environ.get("AWS_ACCESS_KEY_ID", os.environ.get("R2_ACCESS_KEY_ID", ""))
secret = os.environ.get("AWS_SECRET_ACCESS_KEY", os.environ.get("R2_SECRET_ACCESS_KEY", ""))
bucket = os.environ.get("R2_BUCKET_NAME", os.environ.get("R2_BUCKET", "mtgink-cdn"))

print(f"Endpoint: {endpoint}")
print(f"Key ID: {key_id[:8]}...")
print(f"Bucket: {bucket}")

client = boto3.client(
    "s3",
    endpoint_url=endpoint,
    aws_access_key_id=key_id,
    aws_secret_access_key=secret,
    region_name="auto",
    config=Config(s3={"addressing_style": "path"}),
)

test_key = "_container_r2_test.txt"
print(f"\nPUT {test_key}...")
resp = client.put_object(Bucket=bucket, Key=test_key, Body=b"hello from container", ContentType="text/plain")
print(f"  Status: {resp['ResponseMetadata']['HTTPStatusCode']}")
print(f"  ETag: {resp.get('ETag')}")
print(f"  Headers: {dict(resp['ResponseMetadata'].get('HTTPHeaders', {}))}")

print(f"\nHEAD {test_key}...")
try:
    head = client.head_object(Bucket=bucket, Key=test_key)
    print(f"  Status: {head['ResponseMetadata']['HTTPStatusCode']}")
    print(f"  Size: {head['ContentLength']}")
except Exception as e:
    print(f"  FAILED: {e}")

print(f"\nLIST prefix={test_key}...")
try:
    ls = client.list_objects_v2(Bucket=bucket, Prefix=test_key, MaxKeys=5)
    print(f"  KeyCount: {ls.get('KeyCount')}")
    for obj in ls.get('Contents', []):
        print(f"  - {obj['Key']} ({obj['Size']} bytes)")
except Exception as e:
    print(f"  FAILED: {e}")

print("\nDone.")
