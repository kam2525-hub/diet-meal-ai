import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8085
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def run():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"==================================================")
        print(f" MealAI - ダイエット食事自動決定サービス (Prototype)")
        print(f" サーバー起動中: {url}")
        print(f" 終了するには Ctrl + C を押してください")
        print(f"==================================================")
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nサーバーを停止しました。")
            sys.exit(0)

if __name__ == "__main__":
    run()
