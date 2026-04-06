"""Download sample videos and upload them to SiteWatch for demo purposes.

Prerequisites:
    pip install yt-dlp requests

Usage:
    python seed_data.py              # download + upload all
    python seed_data.py --skip-download  # upload already-downloaded files in data/

Videos are sourced from Pexels (free, CC0 license) covering utility/energy
scenarios: substations, solar, wind, construction, dams, flooding, and more.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

API_BASE = os.getenv('SITEWATCH_API', 'http://localhost:8000/api')
DATA_DIR = Path(__file__).parent / 'data'

SAMPLE_VIDEOS = [
    {
        'url': 'https://www.pexels.com/video/aerial-footage-of-a-power-plant-5989390/',
        'filename': 'power_plant_aerial.mp4',
        'site_name': 'Riverside Power Station',
        'camera_id': 'DRONE-RPS-01',
        'location': 'Riverside County, CA',
        'asset_id': 'GEN-RIV-001',
        'gps_lat': '33.9533',
        'gps_lon': '-117.3962',
        'tags': 'power-plant,aerial,equipment-inspection,cooling-towers',
    },
    {
        'url': 'https://www.pexels.com/video/drone-footage-of-solar-panels-7211102/',
        'filename': 'solar_farm_drone.mp4',
        'site_name': 'Mesa Solar Farm',
        'camera_id': 'DRONE-MSF-01',
        'location': 'Mesa, AZ',
        'asset_id': 'SOL-MESA-042',
        'gps_lat': '33.4152',
        'gps_lon': '-111.8315',
        'tags': 'solar-panels,drone,renewable,maintenance-check',
    },
    {
        'url': 'https://www.pexels.com/video/wind-turbine-rotating-4230063/',
        'filename': 'wind_turbine_closeup.mp4',
        'site_name': 'Valley Wind Corridor',
        'camera_id': 'CAM-VWC-03',
        'location': 'San Gorgonio Pass, CA',
        'asset_id': 'WTG-VAL-117',
        'gps_lat': '33.9200',
        'gps_lon': '-116.5800',
        'tags': 'wind-turbine,blade-inspection,renewable,close-up',
    },
    {
        'url': 'https://www.pexels.com/video/drone-footage-of-wind-turbines-at-dawn-35440513/',
        'filename': 'wind_farm_dawn.mp4',
        'site_name': 'Prairie Wind Farm',
        'camera_id': 'DRONE-PWF-01',
        'location': 'Sweetwater, TX',
        'asset_id': 'WTG-PRA-200',
        'gps_lat': '32.4710',
        'gps_lon': '-100.4060',
        'tags': 'wind-farm,dawn-patrol,drone,turbine-array',
    },
    {
        'url': 'https://www.pexels.com/video/aerial-view-of-construction-workers-in-action-34984083/',
        'filename': 'construction_workers_aerial.mp4',
        'site_name': 'Grid Expansion Site Alpha',
        'camera_id': 'DRONE-GEX-02',
        'location': 'Austin, TX',
        'asset_id': 'PROJ-GEX-2026',
        'gps_lat': '30.2672',
        'gps_lon': '-97.7431',
        'tags': 'construction,workers,ppe-check,safety,hard-hats',
    },
    {
        'url': 'https://www.pexels.com/video/aerial-view-of-construction-at-a-dam-site-36657378/',
        'filename': 'dam_construction.mp4',
        'site_name': 'Chickamauga Hydro Station',
        'camera_id': 'DRONE-CHS-01',
        'location': 'Chattanooga, TN',
        'asset_id': 'DAM-CHK-001',
        'gps_lat': '35.0456',
        'gps_lon': '-85.3097',
        'tags': 'dam,hydro,construction,infrastructure,water',
    },
    {
        'url': 'https://www.pexels.com/video/flooded-area-14636688/',
        'filename': 'flooded_area_aerial.mp4',
        'site_name': 'Riverside Flood Zone',
        'camera_id': 'DRONE-EMG-01',
        'location': 'Houston, TX',
        'asset_id': 'EMRG-HOU-001',
        'gps_lat': '29.7604',
        'gps_lon': '-95.3698',
        'tags': 'flooding,disaster,emergency,post-storm,damage-assessment',
    },
    {
        'url': 'https://www.pexels.com/video/drone-footage-of-an-industrial-plant-4380422/',
        'filename': 'industrial_plant_drone.mp4',
        'site_name': 'Baytown Refinery Complex',
        'camera_id': 'DRONE-BRC-01',
        'location': 'Baytown, TX',
        'asset_id': 'REF-BAY-003',
        'gps_lat': '29.7355',
        'gps_lon': '-94.9774',
        'tags': 'refinery,industrial,smoke-stacks,environmental,emissions',
    },
    {
        'url': 'https://www.pexels.com/video/drone-footage-of-cars-parked-and-driving-in-parking-lot-of-the-mall-5607778/',
        'filename': 'parking_lot_surveillance.mp4',
        'site_name': 'Mesa Distribution Yard',
        'camera_id': 'CAM-YARD-05',
        'location': 'Mesa, AZ',
        'asset_id': 'YARD-MESA-001',
        'gps_lat': '33.4200',
        'gps_lon': '-111.8400',
        'tags': 'parking,vehicles,perimeter,security,access-control',
    },
    {
        'url': 'https://www.pexels.com/video/view-of-the-solar-wind-generators-7832757/',
        'filename': 'solar_wind_hybrid.mp4',
        'site_name': 'Mojave Hybrid Energy Park',
        'camera_id': 'DRONE-MHE-01',
        'location': 'Mojave Desert, CA',
        'asset_id': 'HYB-MOJ-001',
        'gps_lat': '35.0524',
        'gps_lon': '-118.1717',
        'tags': 'solar,wind,hybrid,renewable,desert,drone',
    },
    {
        'url': 'https://www.pexels.com/video/aerial-sunset-over-industrial-landscape-35424494/',
        'filename': 'industrial_sunset_aerial.mp4',
        'site_name': 'Port Arthur Industrial Zone',
        'camera_id': 'DRONE-PAZ-01',
        'location': 'Port Arthur, TX',
        'asset_id': 'IND-PAR-010',
        'gps_lat': '29.8850',
        'gps_lon': '-93.9400',
        'tags': 'industrial,sunset,aerial,environmental-monitoring,emissions',
    },
    {
        'url': 'https://www.pexels.com/video/drone-view-of-bridge-2116123/',
        'filename': 'bridge_infrastructure.mp4',
        'site_name': 'Columbia River Crossing',
        'camera_id': 'DRONE-CRC-01',
        'location': 'Portland, OR',
        'asset_id': 'BRG-COL-001',
        'gps_lat': '45.6225',
        'gps_lon': '-122.6764',
        'tags': 'bridge,infrastructure,river,drone,structural-inspection',
    },
]


def check_yt_dlp() -> bool:
    try:
        subprocess.run(['yt-dlp', '--version'], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def download_video(video: dict) -> Path | None:
    dest = DATA_DIR / video['filename']
    if dest.exists() and dest.stat().st_size > 10_000:
        print(f'  [skip] {video["filename"]} already exists ({dest.stat().st_size // 1024}KB)')
        return dest

    print(f'  [download] {video["filename"]} ...')
    try:
        result = subprocess.run(
            [
                'yt-dlp',
                '--no-warnings',
                '--extractor-args', 'generic:impersonate',
                '-f', 'best',
                '--merge-output-format', 'mp4',
                '-o', str(dest),
                video['url'],
            ],
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode != 0:
            print(f'  [error] yt-dlp failed: {result.stderr.strip()[:200]}')
            return None
        if dest.exists() and dest.stat().st_size > 10_000:
            print(f'  [ok] {dest.stat().st_size // 1024}KB')
            return dest
        print(f'  [error] file too small or missing')
        return None
    except subprocess.TimeoutExpired:
        print(f'  [error] download timed out')
        return None
    except Exception as e:
        print(f'  [error] {e}')
        return None


def upload_video(video: dict, filepath: Path, api_base: str = API_BASE) -> bool:
    print(f'  [upload] {video["filename"]} -> {video["site_name"]}')
    try:
        with open(filepath, 'rb') as f:
            resp = requests.post(
                f'{api_base}/videos/upload',
                files={'file': (video['filename'], f, 'video/mp4')},
                data={
                    'site_name': video['site_name'],
                    'camera_id': video['camera_id'],
                    'location': video['location'],
                    'asset_id': video['asset_id'],
                    'gps_lat': video['gps_lat'],
                    'gps_lon': video['gps_lon'],
                    'tags': video['tags'],
                },
                timeout=600,
            )
        if resp.status_code in (200, 201):
            try:
                msg = resp.json().get('message', 'OK')
            except Exception:
                msg = 'OK'
            print(f'  [ok] {msg}')
            return True
        else:
            try:
                detail = resp.json().get('detail', resp.text[:200])
            except Exception:
                detail = resp.text[:200] if resp.text else f'HTTP {resp.status_code}'
            print(f'  [error] {detail}')
            return False
    except requests.exceptions.ConnectionError:
        print(f'  [error] Connection lost — server may be processing. Check backend logs.')
        return False
    except requests.exceptions.ReadTimeout:
        print(f'  [error] Timeout — video is processing in the background. Continuing...')
        return True
    except Exception as e:
        print(f'  [error] {e}')
        return False


def wait_for_processing(n_videos: int) -> None:
    """Wait for Pixeltable's computed columns to process all uploads."""
    print(f'\nWaiting for AI processing ({n_videos} videos)...')
    print('Pixeltable is running: Gemini analysis, frame extraction, embeddings, Whisper transcription...')
    print('This may take several minutes depending on video length and API rate limits.')
    print('You can open http://localhost:8000 now — data will appear progressively.\n')


def main():
    parser = argparse.ArgumentParser(description='Seed SiteWatch with sample utility/energy videos')
    parser.add_argument('--skip-download', action='store_true', help='Skip downloads, upload existing files in data/')
    parser.add_argument('--api', default=API_BASE, help=f'SiteWatch API base URL (default: {API_BASE})')
    args = parser.parse_args()

    api_base = args.api

    print('=' * 60)
    print('SiteWatch — Sample Data Loader')
    print('=' * 60)
    print(f'\nAPI: {api_base}')
    print(f'Data dir: {DATA_DIR}')
    print(f'Videos: {len(SAMPLE_VIDEOS)}\n')

    # Check API is reachable
    try:
        resp = requests.get(f'{api_base}/health', timeout=5)
        if resp.status_code != 200:
            print('ERROR: Backend not healthy. Start it first: python -m uvicorn main:app --port 8000')
            sys.exit(1)
    except requests.exceptions.ConnectionError:
        print('ERROR: Cannot connect to backend. Start it first:')
        print('  cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000')
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Download phase
    if not args.skip_download:
        if not check_yt_dlp():
            print('ERROR: yt-dlp not found. Install it:')
            print('  pip install yt-dlp')
            print('\nOr run with --skip-download if videos are already in data/')
            sys.exit(1)

        print('Phase 1: Downloading videos from Pexels (CC0 licensed)\n')
        downloaded = 0
        for i, video in enumerate(SAMPLE_VIDEOS, 1):
            print(f'[{i}/{len(SAMPLE_VIDEOS)}] {video["site_name"]}')
            path = download_video(video)
            if path:
                downloaded += 1
        print(f'\nDownloaded: {downloaded}/{len(SAMPLE_VIDEOS)}\n')
    else:
        print('Phase 1: Skipping downloads (--skip-download)\n')

    # Upload phase
    print('Phase 2: Uploading to SiteWatch\n')
    uploaded = 0
    for i, video in enumerate(SAMPLE_VIDEOS, 1):
        filepath = DATA_DIR / video['filename']
        if not filepath.exists():
            print(f'[{i}/{len(SAMPLE_VIDEOS)}] {video["site_name"]} — file not found, skipping')
            continue
        if filepath.stat().st_size < 10_000:
            print(f'[{i}/{len(SAMPLE_VIDEOS)}] {video["site_name"]} — file too small, skipping')
            continue

        print(f'[{i}/{len(SAMPLE_VIDEOS)}] {video["site_name"]}')
        if upload_video(video, filepath, api_base):
            uploaded += 1
            time.sleep(2)

    print(f'\nUploaded: {uploaded}/{len(SAMPLE_VIDEOS)}')

    if uploaded > 0:
        wait_for_processing(uploaded)

    print('=' * 60)
    print(f'Done. {uploaded} videos loaded into SiteWatch.')
    print('Open http://localhost:8000 to explore.')
    print('=' * 60)


if __name__ == '__main__':
    main()
