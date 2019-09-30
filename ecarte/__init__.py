import itertools
import logging
import sys

import os
from admin.views import blueprint as admin_blueprint
from flask import Flask
from flask.ext.pymongo import PyMongo
from flask_login import LoginManager

from ecarte.admin.models import User

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# TODO: configure logging via logging.conf
logging.basicConfig(format='%(asctime)s %(levelname)s - %(name)s %(message)s',
                    datefmt='%b %d %H:%M:%S', stream=sys.stdout, level=logging.DEBUG)
logging.getLogger('werkzeug').setLevel(logging.WARNING)

app = Flask(__name__, template_folder='../templates')

app.config['DEBUG'] = True
# TODO (later): include English so Quebecois can use fr as primary language
app.config['SUPPORTED_LANGS_GROUPPED'] = [
    (('zh', 'Chinese'), ('ko', 'Korean'), ('vi', 'Vietnamese')),
    (('fr', 'French'), ('es', 'Spanish')),
]

app.config['MONGO_CONNECT'] = False
#app.config['UPLOAD_DIR'] = '/var/www/ecarte/uploaded'
app.config['UPLOAD_DIR'] = '/home/gburek/smartcarte-uploaded/uploaded'
app.config['ENTRY_PHOTO_SIZE'] = 300

app.config['SUPPORTED_LANGS'] = map(lambda l: l[0], itertools.chain.from_iterable(app.config['SUPPORTED_LANGS_GROUPPED']))
app.config['email.SMPTServer'] = 'smtp.gmail.com:587'
app.config['email.user'] = 'koziolekmatolek71@gmail.com'
app.config['email.pwd'] = 'gruzl1ca'
app.config['email.tls'] = True

app.name = 'smartcarte'
app.secret_key = 's9alab1b1m1k'
app.mongo = PyMongo(app)

app.jinja_env.trim_blocks = True
app.jinja_env.lstrip_blocks = True

from jinja2 import Undefined

class SilentUndefined(Undefined):
    def _fail_with_undefined_error(self, *args, **kwargs):
        return ''

app.jinja_env.undefined = SilentUndefined

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'admin.login'

@login_manager.user_loader
def load_user(uid):
    return User.load(uid)

app.register_blueprint(admin_blueprint, url_prefix='/admin')

