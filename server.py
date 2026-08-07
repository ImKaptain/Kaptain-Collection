import os
import sys
import json
import time
import urllib.parse
import http.server
import socketserver
import pathlib
import yt_dlp

PORT = 8098
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(DIRECTORY, "temp_yt_downloads")
os.makedirs(TEMP_DIR, exist_ok=True)

def cleanup_temp_dir():
    """Keep only recent downloads to save disk & memory."""
    try:
        files = []
        for f in os.listdir(TEMP_DIR):
            fp = os.path.join(TEMP_DIR, f)
            if os.path.isfile(fp):
                files.append((fp, os.path.getmtime(fp)))
        files.sort(key=lambda x: x[1], reverse=True)
        for fp, mtime in files[10:]:
            try:
                os.remove(fp)
            except Exception:
                pass
    except Exception as e:
        print(f"[Cleanup Error] {e}")

class StudioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/youtube":
            self.handle_youtube_download(parsed)
        elif parsed.path.startswith("/temp_yt_downloads/"):
            super().do_GET()
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/youtube":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            data = json.loads(body) if body else {}
            url = data.get('url', '')
            self.download_yt(url)
        else:
            self.send_error(404, "Endpoint not found")

    def handle_youtube_download(self, parsed_url):
        query = urllib.parse.parse_qs(parsed_url.query)
        url = query.get("url", [""])[0]
        self.download_yt(url)

    def download_yt(self, raw_url):
        if not raw_url:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "No URL provided"}).encode('utf-8'))
            return

        # Sanitize YouTube URL: Strip playlist, radio, & tracking parameters if 'v=' is present
        parsed = urllib.parse.urlparse(raw_url)
        qs = urllib.parse.parse_qs(parsed.query)
        if 'v' in qs and qs['v']:
            video_id = qs['v'][0]
            clean_url = f"https://www.youtube.com/watch?v={video_id}"
        else:
            clean_url = raw_url

        print(f"[YouTube Download] Processing URL: {clean_url}")
        cleanup_temp_dir()
        
        out_template = os.path.join(TEMP_DIR, '%(id)s.%(ext)s')
        
        ydl_opts = {
            'format': 'bestvideo[ext=mp4][height<=1080]/bestvideo[height<=1080]/best[ext=mp4]/best',
            'outtmpl': out_template,
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,  # Don't download playlists/radios
            'js_runtimes': {'node': {}},
            'remote_components': ['ejs:github'],
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_url, download=True)
                
                # Handle potential playlist dictionary wrapper
                if 'entries' in info and len(info['entries']) > 0:
                    info = info['entries'][0]

                filename = ydl.prepare_filename(info)
                rel_path = f"/temp_yt_downloads/{os.path.basename(filename)}"

                response_data = {
                    "success": True,
                    "title": info.get('title', 'YouTube Video'),
                    "duration": info.get('duration', 0),
                    "filename": os.path.basename(filename),
                    "file_url": rel_path
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode('utf-8'))
                print(f"[YouTube Download] Downloaded: {info.get('title')} -> {rel_path}")

        except Exception as e:
            print(f"[YouTube Download Error] {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def run():
    handler = StudioHandler
    httpd = ThreadedHTTPServer(("", PORT), handler)
    print(f"Nuvio GIF Studio Threaded Server running on http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == "__main__":
    run()
