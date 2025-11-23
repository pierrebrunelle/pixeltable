# Pixeltable App Template Starter Kit

This starter kit provides a minimal setup for building data-intensive applications with Pixeltable. It includes a FastAPI backend pre-configured with Pixeltable and a skeleton Next.js frontend.

It is designed to be self-hosted, specifically on AWS EC2 with EBS for persistent storage, and configured to use Pixeltable Cloud for data sharing.

## Project Structure

- `backend/`: FastAPI application with Pixeltable integration.
- `frontend/`: Minimal Next.js skeleton (optional).
- `docker-compose.yml`: Deployment configuration.

## Prerequisites

1.  **Pixeltable Cloud Account**: Sign up at [pixeltable.com](https://pixeltable.com) to get your API key for data sharing features.
2.  **Docker & Docker Compose**: Required for containerized deployment.

## Local Development

1.  **Setup Backend**:
    ```bash
    cd backend
    pip install -r requirements.txt
    export PIXELTABLE_API_KEY="your_api_key_here"
    uvicorn main:app --reload
    ```

2.  **Setup Frontend** (Optional):
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

## Self-Hosting Guide: AWS EC2 with EBS

To host this application on AWS and ensure your Pixeltable data persists across restarts/terminations, follow these steps to set up an EC2 instance with an attached EBS volume.

### 1. Launch an EC2 Instance

1.  Go to the AWS Console -> EC2 -> Launch Instance.
2.  **AMI**: Ubuntu Server 22.04 LTS (recommended).
3.  **Instance Type**: `t3.medium` or larger (Pixeltable benefits from memory).
4.  **Key Pair**: Create or select an existing key pair for SSH access.
5.  **Network Settings**: Allow SSH (port 22), HTTP (port 80), and Custom TCP (port 8000 for API).

### 2. Create and Attach an EBS Volume

 Pixeltable stores data locally. To prevent data loss if the instance is terminated, use a separate EBS volume.

1.  Go to **Elastic Block Store -> Volumes**.
2.  **Create Volume**:
    -   **Type**: gp3 (General Purpose SSD).
    -   **Size**: e.g., 100 GiB (depending on your data needs).
    -   **Availability Zone**: MUST match the AZ of your EC2 instance.
3.  Select the created volume -> **Actions -> Attach Volume**.
4.  Select your running instance. The device name will likely be `/dev/sdf` (or `/dev/xvdf` on the instance).

### 3. Mount the EBS Volume

SSH into your instance:
```bash
ssh -i your-key.pem ubuntu@your-instance-ip
```

Identify the attached volume:
```bash
lsblk
# You should see a disk like nvme1n1 or xvdf that is not mounted.
```

Format the volume (ONLY if it's new - DO NOT run this on an existing data volume):
```bash
sudo mkfs -t ext4 /dev/nvme1n1  # Replace with your device name
```

Create a mount point and mount it:
```bash
sudo mkdir -p /var/lib/pixeltable
sudo mount /dev/nvme1n1 /var/lib/pixeltable
```

Configure auto-mount on reboot:
```bash
# Get the UUID of the volume
sudo blkid
# Add entry to /etc/fstab
echo "UUID=YOUR_UUID_HERE /var/lib/pixeltable ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
```

### 4. Install Docker

```bash
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

# Install Docker packages:
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 5. Deploy the App

Clone this repository (or copy the files) to the instance.

Create a `.env` file with your Pixeltable Cloud API Key:
```bash
echo "PIXELTABLE_API_KEY=your_actual_api_key" > .env
```

Start the services:
```bash
sudo docker compose up -d
```

**Note on Persistence:**
The `docker-compose.yml` maps the host directory `/var/lib/pixeltable` (where we mounted the EBS volume) to the container's `/root/.pixeltable` directory.
```yaml
volumes:
  - /var/lib/pixeltable:/root/.pixeltable
```
*Make sure to update `docker-compose.yml` to point to the absolute path `/var/lib/pixeltable` instead of the named volume if you want direct host mapping, or ensure the named volume `pixeltable_data` is backed by that path.*

**Recommended `docker-compose.yml` modification for host path:**
```yaml
services:
  api:
    ...
    volumes:
      - /var/lib/pixeltable:/root/.pixeltable
```

## Data Sharing Features

This template includes examples of using Pixeltable Cloud features:

1.  **Publishing**: Push local tables to the cloud.
    ```python
    pxt.publish(source='my_app.my_table', destination_uri='pxt://username/repo/my_table')
    ```
    Exposed via `POST /share/publish`.

2.  **Replication**: Pull data from the cloud.
    ```python
    pxt.replicate(remote_uri='pxt://username/repo/source_table', local_path='my_app.local_copy')
    ```
    Exposed via `POST /share/replicate`.

