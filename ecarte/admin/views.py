import logging
from functools import wraps

import re
import os
from flask import request, render_template, redirect, flash, session, abort, jsonify, current_app as app
from flask.blueprints import Blueprint
from flask.ext.login import login_required, login_user, logout_user, current_user
from werkzeug.exceptions import HTTPException
import pprint

from models import RestaurantAdmin, Restaurant

# TODO: Add access checks to all views (decorator)

STATUS_OK =  'ok'
STATUS_ERROR = 'error'
MSG_CATEGORY_OK = 'success'

blueprint = Blueprint('admin', __name__)


class Errors(dict):
    pass


logger = logging.getLogger(__name__)


def _check_access():
    if not current_user.is_authenticated():
        abort(403)
    rid = request.form['rid'].strip()
    r = Restaurant.get(rid)
    if not r:
        return Errors(msg='Restaurant not found')
    if current_user.id != r['managed_by'].id:
        abort(403)


def ajax_request(fn):
    @wraps(fn)
    def decorated_view(*args, **kwargs):
        if not current_user.is_authenticated():
            abort(403)
        try:
            ret = fn(*args, **kwargs)
            if ret is None:
                ret = {'status': STATUS_OK}
            elif isinstance(ret, Errors):
                if 'status' not in ret:
                    ret['status'] = STATUS_ERROR
            elif isinstance(ret, dict):
                if 'status' not in ret:
                    ret['status'] = STATUS_OK
            else:
                raise ValueError('ajax_request: unrecognized return type from the decorated function')
            return jsonify(**ret)
        except HTTPException:
            raise  # do not interfere with abort
        except:
            logger.exception('Error in ajax_request:')
            abort(500)
    return decorated_view


@blueprint.route('/')
@blueprint.route('/<rid>')
@login_required
def root_home(rid=None):
    uid = None if current_user.is_admin else current_user.id
    args = dict(rlist = list(Restaurant.list_names_and_addresses(uid)))
    if rid:
        # TODO: check if r.managed_by == uid
        from bson.errors import InvalidId
        try:
            r = Restaurant.get(rid)
            if not r:
                logger.error('Restaurant ID not found: %s', rid)
                abort(404)
            args.update(restaurant=r)
            return render_template('/admin/root.html', **args)
        except InvalidId:
            logger.error('Invalid restaurant ID: %s', rid)
            abort(404)
    else:
        if current_user.is_admin or len(args['rlist'])>1:
            return render_template('/admin/root.html', **args)
        else:
            return redirect('/admin/%s' % args['rlist'][0]['_id'])


def _section_helper(updatefn):
    rid = request.form['rid'].strip()
    title = request.form.get('title', '').strip()
    notes = request.form.get('notes', '').strip()
    sectidx = request.form.get('sectidx', '')
    subsectidx = request.form.get('subsectidx', '')
    r = Restaurant.get(rid)
    if not r:
        abort(404)
    #print 'sectidx:', sectidx, ' subsectidx:', subsectidx
    if sectidx:
        if not re.match('^-?\d+$', sectidx):
            abort(400)
        sectidx = int(sectidx)
        if sectidx >= len(r['menu']):
            print 'sectidx >=', len(r['menu'])
            abort(400)
    else:
        sectidx = -1
    if subsectidx:
        if not re.match('^-?\d+$', subsectidx):
            abort(400)
        subsectidx = int(subsectidx)
        if 'subsections' in r['menu'][sectidx] and subsectidx >= len(r['menu'][sectidx]['subsections']):
            abort(400)
    else:
        subsectidx = -1
    ret = updatefn(r, sectidx, subsectidx, title, notes)
    if ret:
        return ret
    Restaurant.save(r)


def _save_helper(updatefn, **kwargs):
    rid = request.form.get('rid', '').strip()
    new = False
    r = None
    if rid:
        r = Restaurant.get(rid)
        if not r:
            abort(404)
    else:
        if kwargs.get('create_new', False):
            r, new = {}, True
        else:
            abort(404)
    ok, data = updatefn(r, request.form)
    if ok:
        data.update(status=STATUS_OK, rid=str(r['_id']))
        if new:
            data['redirect'] = True
        if 'success_msg' in kwargs:
            data['success_msg'] = kwargs['success_msg']
    else:
        data.update(status=STATUS_ERROR)
    return data


@blueprint.route('/savebd', methods=['POST'])
@ajax_request
def save_basic_data():
    def update(r, form):
        errors = Restaurant.save_basic_data(r, form)
        if errors:
            return False, errors
        return True, dict(slug=r['slug'], contact_phone=r['contact_phone'])
    ret = _save_helper(update, create_new=True)
    if 'redirect' in ret:
        flash('Data saved', MSG_CATEGORY_OK)
    return ret


@blueprint.route('/saveloc', methods=['POST'])
@ajax_request
def save_location():
    def update(r, form):
        errors = Restaurant.save_location(r, form)
        if errors:
            return False, errors
        loc =  r['locations'][0]
        data = {
            'latlong':  '%f , %f' % (loc['lat'],loc['long']),
            'order_phone': loc['order_phone'],
        }
        for i in range(0,7):
            data['hrs%d'%i] = '' if loc['hours'][i]==[] else ' - '.join(loc['hours'][i])
        return True, data
    return _save_helper(update)


@blueprint.route('/savecat', methods=['POST'])
@ajax_request
def save_category():
    def update(r, form):
        errors  = Restaurant.save_category(r, form)
        if errors:
            return False, errors
        return True, dict()
    return _save_helper(update)


@blueprint.route('/delcat', methods=['POST'])
@ajax_request
def delete_category():
    def do_delete(r, form):
        parent_idx = int(form.get('parent_index', -1))
        idx = int(form.get('index', -1))
        errors  = Restaurant.delete_category(r, parent_idx, idx)
        if errors:
            return False, errors
        return True, dict()
    return _save_helper(do_delete, success_msg='The category has been deleted.')


@blueprint.route('/saveentry', methods=['POST', 'GET'])
@ajax_request
def save_entry():
    def update(r, form):
        errors =  Restaurant.save_entry(r, form)
        if errors:
            return False, errors
        return True, dict()
    return _save_helper(update)


@blueprint.route('/uplephoto', methods=['POST'])
@ajax_request
def upload_entry_photo():
    from PIL import Image
    from StringIO import StringIO
    def update(r, form):
        if not request.files or 'file' not in request.files:
            return False, {'file': 'Missing image file.'}
        if request.files['file'].content_type != 'image/jpeg':
            return False, {'file': 'Only JPEG images are allowed.'}
        ret = Restaurant.update_entry_image(r, form)
        if ret[0]:
            sio = StringIO(request.files['file'].read())
            img = Image.open(sio)
            # crop to a sqare
            w1, w2 = min(img.size[0], img.size[1]), max(img.size[0], img.size[1])
            d = (w2-w1)/2
            if img.size[0] > img.size[1]:
                img = img.crop((d, 0, w2-d, w1))
            elif img.size[1] > img.size[0]:
                img = img.crop((0, d, w1, w2-d))
            sz = app.config['ENTRY_PHOTO_SIZE']
            img =  img.resize((sz, sz), Image.ANTIALIAS)
            path = os.path.join(app.config['UPLOAD_DIR'], ret[1])
            img.save(path, optimize=True, quality=65)
            if ret[0]:
                return True, {'image': '/uploaded/'+ret[1]}
        return ret
    return _save_helper(update)


@blueprint.route('/root/import', methods=['POST'])
def import_from_xls():
    if 'xlsfile' in request.files:
        fileobj = request.files['xlsfile']
        if fileobj:
            from werkzeug import secure_filename
            filepath = '/tmp/'+secure_filename(fileobj.filename)
            fileobj.save(filepath)
            admin = RestaurantAdmin()
            rid, errors = admin.import_from_xls(filepath)
            if errors:
                # TODO: Do not embed html here, admin template should create markup
                msg='alert|<h5>Import failed because of the following errors:</h5><ul>'
                for errmsg in errors:
                    msg += '<li>'+errmsg+'</li>'
                msg += '</ul>'
                flash(msg)
            else:
                flash('success|Import was successful.')
                if rid:
                    return redirect('admin/'+str(rid))
    return redirect('/admin')


@blueprint.route('/login', methods=['GET', 'POST'])
def login():
    errormsg = ''
    if request.method == 'POST':
        usrnm = request.form['username'].strip()
        pwd = request.form['password']
        from ecarte.admin.models import User
        u = User.find(usrnm)
        if not u:
            errormsg = 'Invalid user name.'
        else:
            if u.check_password(pwd):
                login_user(u, remember=True)
                # TODO: if not admin and has only one r, redirect to the edit page
                url = 'admin'
                if not u.is_admin:
                    rlist = list(Restaurant.list_names_and_addresses(u.id))
                    if len(rlist)==1:
                        url = 'admin/%s' % rlist[0]['_id']
                return redirect(request.args.get('next') or url)
            else:
                errormsg = 'Invalid password.'
    return render_template('admin/login.html', errormsg=errormsg)


@blueprint.route('/logout')
def logout():
    logout_user()
    flash('You have been logged out.')
    return redirect('/admin/login')
