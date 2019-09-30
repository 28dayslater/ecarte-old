from ecarte import app

# uwsgi --socket 127.0.0.1:8080 -w wsgi:app --py-autoreload <secs> -p 2 --lazy-apps

if __name__ == '__main__':
    app.run()