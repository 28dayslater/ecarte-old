String.prototype.fill = function () {
    var arghs = arguments;
    return this.replace(/{\d+}/g, function (match) {
        return arghs[match.substr(1, match.length - 2)] || '';
    });
};

function clear_errors_and_messages() {
    $('#messages').empty();
    $('form[name=edit-form] small.error').remove();
}

function _collect_values(inputNames) {
    /* Note: each input must have ID equal to "id-<inputName>" */
    var langs = supported_langs();
    var params = {
        rid:   $('#id-rid').val(),
        languages: langs.join(',')
    };
    for (var idx=0; idx<inputNames.length; ++idx) {
        var inp = $('#id-'+inputNames[idx]);
        if (inp.length==0)
            continue;
        if (inp.hasClass('multilang'))
            for (var lidx=0; lidx<langs.length; lidx++)
                params[inputNames[idx]+'-'+langs[lidx]] = inp.data('value-'+langs[lidx]);
        else
            params[inp.attr('name')] = inp.val();
    }
    return params;
}

function ajax_post() {
    /* Arguments: url, input names (each can be a space separated list (string))..., POST success callback
       Example: ajax_post('/admin/savexx', 'input1 input2 input3', 'input4 input5', function(data) {...}) */
    $('#loader-icon').show();

    // sync multilang inputs
    $('input.multilang,textarea.multilang').each(function(idx) {
        var input = $(this);
        var lang = current_lang();
        if (input.hasClass('rte'))
            input.data('value-'+lang, tinymce.get(input.attr('id')).getContent());
        else
            input.data('value-'+lang, input.val());
    });

    var url = arguments[0];
    var success_cb = arguments[arguments.length-1];
    var inputs = [], direct_params = {};
    for (var pidx=1; pidx<arguments.length-1; ++pidx)
        if (arguments[pidx].constructor == String)
            [].push.apply(inputs, arguments[pidx].trim().split(/ +/));
        else if (arguments[pidx].constructor == Object)
            direct_params = arguments[pidx];
    var params = _collect_values(inputs);
    $.extend(params, direct_params);
    //console.log('** params: ', params)
    $.post(url, params)
     .done(function (data) {
        clear_errors_and_messages();
        var msgdiv = $('#messages');
        if (data.status == 'ok') {
            if (!data.redirect) {
                var msg = data.success_msg || 'Data has been saved.';
                msgdiv.append($('<div data-alert class="alert-box success">'+msg+'</div>'));
                /* update fields that were reformatted by validator */
                for (var fieldnm in data)
                    if (data.hasOwnProperty(fieldnm))
                        $('#id-' + fieldnm).val(data[fieldnm]);
            }
            if (success_cb)
                success_cb(data);
        }
        else {
            if (data.msg)
                msgdiv.append($('<div data-alert class="alert-box alert">{0}.</div>'.fill(data.msg)));
            else {
                msgdiv.append($('<div data-alert class="alert-box alert">Please correct the errors below and retry.</div>'));
                for (fieldnm in data)
                    if (data.hasOwnProperty(fieldnm)) {
                        var errorMsg = $('<small class="error">{0}</small>'.fill(data[fieldnm]));
                        errorMsg.appendTo($('#id-'+fieldnm).parent());
                    }
            }
        }
     })
     .fail(function (jqXHR, textStatus, errorThrown) {
        $('#messages').empty().append($('<div data-alert class="alert-box alert">An error occurred while communicating with the server.</div>'));
        /*console.log('status:', textStatus, ' errorThrown:', errorThrown);*/
     })
     .always(function () {
        $('#loader-icon').hide();
     });
}

function save_basic_data() {
    ajax_post(
        '/admin/savebd',
        'name slug description keywords contact_name contact_phone contact_email',
        'login_username login_email',
        function(data) {
            if (data.redirect)
                window.location.href = '/admin/'+data.rid;
        }
    );
    return false;
}

function save_loc() {
    ajax_post(
        '/admin/saveloc',
        'address1 address2 city province latlong order_phone',
        'hrs0 hrs1 hrs2 hrs3 hrs4 hrs5 hrs6',
        function(data) {
            var address = $('#id-address1').val() + ' ' + $('#id-city').val() + ', ' + $('#id-province').val();
            var rid = $('#id-rid').val();
            $('.off-canvas-list a[href="/admin/'+rid+'"]')
                .find('div:eq(1)')
                .text(address);
        }
    );
    return false;
}

function get_cat_idx() {
    var a = $('#nav-menu').find('a.active');
    if (a.hasClass('menu'))
        return {index: -1, parent_index: -1};
    var current_li = a.parent();
    var parent_li = current_li.parent().parent();
    var li = current_li;
    var idx = 0;
    var parent_idx = 0;
    if (!a.hasClass('tempcat'))
        for (idx=0; li.length!=0; ++idx)
            li = li.prev();
    if (parent_li.data('type') == 'category') {
        li = parent_li;
        for (parent_idx=0; li.length!=0; ++parent_idx)
            li = li.prev();
    }
    return {index:idx-1, parent_index: parent_idx-1};
}

function get_entry_idx() {
    var ret  =  {
        index:  -1,
        catidx: -1,
        subcatidx: -1
    };
    var catidx = 0;
    var subcatidx = -1;
    var idx = -1;
    var a = $('#nav-menu').find('a.active');
    var entry_li = a.parent();
    var li = entry_li;
    if (!a.hasClass('tempentry')) {
        for (idx = 0; li.length > 0 && li.data('type') == 'entry'; ++idx)
            li = li.prev();
        ret.index = idx-1;
    }
    var parent_li = entry_li.parent().parent();
    if (parent_li.data('type') == 'subcategory') {
        for (idx=0, li=parent_li; li.length>0; ++idx)
            li = li.prev();
        ret.subcatidx = idx-1;
        parent_li = parent_li.parent().parent();
    }
    for (idx=0, li=parent_li; li.length>0; ++idx)
        li = li.prev();
    ret.catidx = idx-1;
    return ret;
}

function save_cat() {
    var titleinp = $('#id-category_title');
    var langs = ['en'].concat($('#id-all_langs').val().split(','));
    var indexes = get_cat_idx();
    ajax_post(
        '/admin/savecat',
        'category_title category_description',
        indexes,
        function (data) {
            var title = $('#id-category_title');
            var descr = $('#id-category_description');
            var li;
            var active_menu_a = $('#nav-menu a.active');
            if (active_menu_a.hasClass('menu')) {
                active_menu_a.removeClass('active');
                li = $('<li><a href="#menu-section" class="tab category active">'+title.data('en-value').toUpperCase()+'</a><ul></ul></li>');
                var menu = active_menu_a.parent();
                li.data('index', menu.find('>ul>li').length)
                  .data('type', 'category');
                li.appendTo(active_menu_a.next());
                var a = li.find('>a');
                $('<img src="/img/category.svg" class="add-subcat" alt="Add subcategory">').appendTo(a);
                $('<img src="/img/dish.svg" class="add-entry" alt="Add menu entry">').appendTo(a);
            }
            else {
                var kids = active_menu_a.children();
                active_menu_a.removeClass('tempcat').text(title.data('value-en').toUpperCase());
                // images were removed by setting the text
                kids.appendTo(active_menu_a);
                li = active_menu_a.parent();
            }
            // TODO: supported langs
            for_all_langs(function(lang) {
                li.data('title-'+lang, title.data('value-'+lang))
                  .data('description-'+lang, descr.data('value-'+lang));
            });
            title.removeAttr('placeholder');
            descr.removeAttr('placeholder');
            $('#save-cat').text('Save');
            $('#del-cat').data('action', 'delete').text('Delete').show();
        });
    return false;
}

function save_entry() {
    var params = get_entry_idx();
    params.markers = '';
    var markers = [];
    $('#id-markers').find('input:checked').each(function(idx) {
        markers.push($(this).val());
    });
    params.markers = markers.join(',');
    var langs = supported_langs();
    $('#id-prices input.price-amount').each(function(pridx) {
        var price = $(this);
        var descr = price.next();
        if (price.val() || descr.data('value-en')) {
            params['price'+(pridx+1)] = price.val();
            for (var lidx=0; lidx<langs.length; ++lidx)
                params['price_description{0}-{1}'.fill(pridx+1,langs[lidx])] = descr.data('value-'+langs[lidx]) || '';
        }
    });
    ajax_post(
        '/admin/saveentry',
        'entry_title entry_description peppers entry_photo',
        params,
        function(data) {
            var title = $('#id-entry_title');
            var descr = $('#id-entry_description');
            var active_a = $('#nav-menu a.active');
            var li = active_a.parent();
            li.removeData();
            active_a.removeClass('tempentry').text(title.data('value-en'));
            for (var lidx=0; lidx<langs.length; ++lidx) {
                var lang = langs[lidx];
                li.data('title-'+lang, title.data('value-'+lang));
                li.data('description-'+lang, descr.data('value-'+lang));
            }
            li.data('peppers', $('#id-peppers').val());
            li.data('markers', params.markers);
            li.data('photo', $('#id-photo img').attr('src'));
            $('#id-prices>div').each(function(idx) {
                var pridx = idx+1;
                var me = $(this);
                var amount = me.find('>input:eq(0)');
                descr =  amount.next();
                if (amount.val()) {
                    li.data('price'+pridx, amount.val());
                    for (var lidx=0; lidx<langs.length; ++lidx) {
                        var lang = langs[lidx];
                        li.data('price_description{0}-{1}'.fill(pridx, lang), descr.data('value-'+lang));
                    }
                }
                else {
                    me.hide();
                    li.removeData('price'+pridx);
                    for (var lidx=0; lidx<langs.length; ++lidx) {
                        li.removeData('price_description{0}-{1}'.fill(pridx, langs[lidx]));
                    }
                }
            });
        }
    );
    return false;
}

function delete_cat() {
    var active_li = $('#nav-menu a.active').parent();
    var indexes = get_cat_idx();
    ajax_post(
        '/admin/delcat',
        indexes,
        function (data) {
            var num_siblings = active_li.parent().children().length;
            var li_to_make_active;
            if (num_siblings == 1)
                li_to_make_active = active_li.parent().parent();
            else if (indexes.index == num_siblings-1)
                li_to_make_active = active_li.prev();
            else
                li_to_make_active = active_li.next();
            active_li.remove();
            var a = li_to_make_active.find('>a');
            a.addClass('active');
            copy_menu_item_to_edits(a);
        }
    );
}

function new_subcat(active_a) {
    var parent = active_a.parent();
    var existing_temp = parent.find('>ul>li>a.tempcat');
    var title = $('#id-category_title');
    var descr = $('#id-category_description');

    if (existing_temp.length) {
        existing_temp.addClass('active');
    }
    else {
        var newcat = $('<li data-type="subcategory"><a href="#menu-section" class="tab active tempcat">New Subcategory</a></li>');
        newcat.appendTo(parent.find('>ul'));
        $('<img src="/img/dish.svg" class="add-entry" alt="Add menu entry">').appendTo(newcat.find('a'));
    }
    active_a.removeClass('active');
    title.attr('placeholder', 'Subcategory Title');
    descr.attr('placeholder', 'Subcategory Description');
    clear_inputs(title, descr);
    $('#del-cat').text('Cancel').data('action','cancel-subcat');
    title.focus();
}

function cancel_new_subcat() {
    var active_a = $('#nav-menu a.active.tempcat');
    var ul = active_a.parent().parent();
    var new_active_a;
    if (ul.children().length>1)
        new_active_a  = active_a.parent().prev().find('>a');
    else
        new_active_a  = ul.prev();
    active_a.parent().remove();
    new_active_a.addClass('active');
    $('#id-category_title, #id-category_description').removeAttr('placeholder');
    copy_menu_item_to_edits(new_active_a);
}

function new_entry(active_a) {
    var parent = active_a.parent();
    var existing_temp = parent.find('>ul>li>a.tempentry');
    if (existing_temp.length)  {
        existing_temp.addClass('active');
    }
    else {
        var newentry = $('<li data-type="entry"><a href="#menu-entry" class="tab active tempentry">New Menu Entry</a></li>');
        newentry.appendTo(parent.find('>ul'));
    }
    var title = $('#id-entry_title');
    clear_inputs(title, $('#id-entry_description'));
    active_a.removeClass('active');
    $('#page-title').text(titles['#menu-entry']);
    $('form[name=edit-form] > div').hide();
    $('#menu-entry').show();
    $('#del-entry').text('Cancel').data('action','cancel-entry');

    title.focus();
}

var __langs;
function for_all_langs(f) {
    if (!__langs)
        __langs = ['en'].concat($('#id-all_langs').val().split(','));
    for (var lidx=0; lidx<__langs.length; ++lidx)
        f(__langs[lidx]);
}

function supported_langs() {
    var langs = [$('#id-primary-lang').val() || 'en'];
    $('#id-languages').find('input[name=languages]:checked').each(function() {
        langs.push($(this).val());
    });
    return langs;
}

function clear_inputs() {
    for (var idx=0; idx<arguments.length; ++idx) {
        var input = $(arguments[idx]);
        input.val('').removeData();
        if (input.hasClass('rte'))
            tinymce.get(input.attr('id')).setContent('');
    }
}

function copy_menu_item_to_edits(a) {
    var li = a.parent();
    var titleinp;
    var descrinp;
    var langs  = supported_langs();
    var currentLang = $('#multi-lang-buttons img.active').data('lang');

    function _common() {
        titleinp.val(li.data('title-'+currentLang));
        descrinp.val(li.data('description-'+currentLang));
        tinymce.get(descrinp.attr('id')).setContent(descrinp.val());
        for (var idx=0; idx<langs.length; ++idx)  {
            var lang = langs[idx];
            titleinp.data('value-'+lang, li.data('title-'+lang));
            descrinp.data('value-'+lang, li.data('description-'+lang));
        }
        titleinp.focus();
    }

    switch (li.data('type')) {
        case 'category':
        case 'subcategory':
            titleinp = $('#id-category_title');
            descrinp = $('#id-category_description');
            _common();
            $('#save-cat').text('Save');
            $('#del-cat').show();
            if (a.hasClass('tempcat'))
                $('#del-cat').text('Cancel').data('action','cancel-subcat');
            else
                $('#del-cat').text('Delete').data('action', 'delete');
            break;
        case 'entry':
            titleinp = $('#id-entry_title');
            descrinp = $('#id-entry_description');
            _common();
            var peppers = $('#id-peppers');
            var peppers_val = li.data('peppers');
            peppers.val(peppers_val);
            var src = '/img/redpepper.svg';
            peppers.parent().find('img').attr('src', '/img/pepper.svg');
            switch (parseInt(peppers_val)) {
                case 3: peppers = peppers.next().attr('src', src);
                case 2: peppers = peppers.next().attr('src', src);
                case 1: peppers = peppers.next().attr('src', src);
            }
            var markers = li.data('markers');
            var markersdiv = $('#id-markers');
            markersdiv.find('input').prop('checked', false);
            if (markers) {
                markers = markers.split(',');
                for (var idx=0; idx<markers.length; ++idx)
                    markersdiv.find('[value='+markers[idx]+']').prop('checked', true);
            }
            var photourl = li.data('photo') || '/img/dish.svg';
            $('#id-photo img').attr('src', photourl);
            $('#id-entry_photo').val(photourl);
            $('#id-prices input').val('').parent().parent().find('>div:gt(0)').hide();
            for (var pridx=1; pridx<=5; ++pridx) {
                var amount = li.data('price'+pridx);
                //console.log('price',pridx,amount)
                if (amount == undefined)
                    break;
                var prinput = $('#id-price'+pridx);
                var descinput = prinput.next();
                prinput.val(amount).parent().show();
                for (var lidx=0; lidx<langs.length; ++lidx) {
                    var lang = langs[lidx];
                    descinput.data('value-'+lang, li.data('price_description{0}-{1}'.fill(pridx, lang)));
                }
                descinput.val(li.data('price_description{0}-{1}'.fill(pridx, currentLang)));
            }
            break;
        default:
            clear_inputs($('#id-category_title'), $('#id-category_description'));
            $('#del-cat').hide();
            $('#save-cat').show().text('Add Category');
    }
}

function clear_cat_edits() {
    $('#id-category_title').val('');
    $('#id-category_description').val('');
}

function lang_button_click() {
    var me = $(this);
    var lang = me.data('lang');
    var prevLang = me.parent().find('img.active').data('lang');

    me.parent().find('img').removeClass('active');
    me.addClass('active');

    $('input.multilang,textarea.multilang').each(function() {
        var input = $(this);
        if (input.hasClass('rte')) {
            var editor = tinymce.get(input.attr('id'));
            input.data('value-'+prevLang, editor.getContent());
            editor.setContent(input.data('value-'+lang));
        }
        else
            input.data('value-'+prevLang, input.val())
                 .val(input.data('value-'+lang));
    });
}

function current_lang() {
    var activeLangImg = $('#multi-lang-buttons img.active');
    if (activeLangImg.length>0)
        return activeLangImg.data('lang');
    // TODO: replace with default language variable
    return 'en';
}

// This is probably not needed...
function multi_lang_input_blur() {
    var me = $(this);
    var activeLangImg = $('#multi-lang-buttons img.active');
    if (activeLangImg.length>0) {
        var lang = activeLangImg.data('lang');
        me.data('value-'+lang, me.val());
    }
    else
        me.data('value-en', me.val());
}

function show_flags() {
    var used_langs = $('#basic-data input[name=languages]:checked');
    if (used_langs.length>0) {
        var langset = {};
        for (var idx=0; idx<used_langs.length; ++idx)
            langset[$(used_langs[idx]).val()] = true;
        var flags = $('#multi-lang-buttons img');
        $(flags[0]).addClass('active').show();
        for (idx=1; idx<flags.length; ++idx) {
            var flag = $(flags[idx]);
            flag.removeClass('active');
            if (flag.data('lang') in langset)
                flag.show();
        }
    }
}

function lang_checkbox_change() {
    var me = $(this);
    var lang = me.val();
    var on = me.is(':checked');
    var flagImg = $('img[data-lang='+lang+']');
    var defaultLangFlag = flagImg.parent().children(':first-child');
    // FIXME: do that for all multilang inputs and handle case when all langs are unchecked than one of them is checked
    if (on) {
        defaultLangFlag.show();
        flagImg.show();
    }
    else {
        // TODO: this has to be done for all multilang inputs in a loop
        if (flagImg.hasClass('active')) {
            var input = flagImg.parent().prev();
            flagImg.removeClass('active');
            defaultLangFlag.addClass('active');
            input.val(defaultLangFlag.next().val());
        }
        flagImg.hide();
        if (me.parent().parent().parent().find(':checked').length==0)
            defaultLangFlag.hide();
    }
}

function submit_on_enter(inputid, buttonid) { // need '#' in ids
    $(inputid).keyup(function (e) {
        if (e.keyCode == 13)
            $(buttonid).click();
    });
}

function pepper_click() {
    var pepper = $(this);
    var hotness = $('#id-peppers');
    var howhot = pepper.data('peppers');
    if (howhot>1)
        hotness.val(howhot);
    else
        hotness.val(hotness.val()=='1'?  '0' : '1');
    pepper.parent().find('img').each(function(idx)  {
        if (idx < parseInt(hotness.val()))
            $(this).attr('src', '/img/redpepper.svg');
        else
            $(this).attr('src', '/img/pepper.svg');
    });
}

function add_price_row() {
    // TODO: show the first hidden row
    var me = $(this);
    var next = me.parent().parent().next();
    while (next && next.is(':visible'))
        next = next.next();
    if (next) {
        next.show();
        me.next().show();
    }
}

function remove_price_row() {
    var me = $(this);
    var last = me.parent().parent().parent().find('>div:last-child');
    while (last.prev() && last.is(':hidden'))
        last = last.prev()
    last.hide().find('input').val('').removeData();
    if (last.find('input:eq(0)').attr('name') == 'price2')
        me.hide();
}

var titles = {
    '#basic-data': 'Restaurant Information',
    '#location': 'Location',
    '#menu-section': 'Menu Category',
    '#menu-entry': 'Menu Entry'
};

function on_photo_dragover(e) {
    e.stopPropagation();
    e.preventDefault();
    e.target.className = e.type == 'dragover'? 'hover' : '';
}

function on_photo_drop(e) {
    on_photo_dragover(e);
    var files = e.dataTransfer.files || e.target.files;
    console.log('files:', files.length);
    console.log('File: ', files[0].name, files[0].size, 'b', files[0].type);
    var error_span = $('#photo-div span.error');
    if (files[0].type != 'image/jpeg')
        error_span.css('display', 'block'); // .show() would set display to 'inline'
    else {
        error_span.hide();

    }
}

$(function () {
        tinymce.init({
        selector: 'textarea.rte',
        plugins: 'charmap textcolor colorpicker{% if current_user.is_admin %} code{% endif %}',
        menubar: false,
        elementpath: false,
        resize: false,
        statusbar: false,
        toolbar: 'bold italic underline superscript charmap | fontsizeselect forecolor{% if current_user.is_admin %} | code{% endif %}',
    });

    $('#import').click(function () {
        $('#xlsfile').click();
        return false;
    });

    $('#xlsfile').change(function () {
        $('form[name=import-form]').submit();
    });

    /* navigation menu click handler */
    $('.side-nav').on('click', 'a.tab', function () {
        $('.side-nav a').removeClass('active');
        $('form[name=edit-form] > div').hide();
        var a = $(this);
        $(a.attr('href')).show();
        $('#page-title > span').text(titles[a.attr('href')]);
        a.addClass('active');
        clear_errors_and_messages();

        if (a.parent().attr('id') == 'nav-menu')
            clear_cat_edits();
        else
            copy_menu_item_to_edits(a);
        return false;
    });

    $('input[name=languages]').change(lang_checkbox_change);
    $('#multi-lang-buttons>img').click(lang_button_click);
    $('#save-bd').click(save_basic_data);
    $('#save-loc').click(save_loc);
    $('#save-cat').click(save_cat);
    $('#add-cat').click(save_cat);
    $('#del-cat').click(function () {
        if ($(this).data('action') == 'cancel-subcat')
            cancel_new_subcat();
        else
            $('#delete-cat-question').foundation('reveal', 'open')
    });
    $('#delete-cat-question a.button').click(function () {
        var btn = $(this);
        $('#delete-cat-question').foundation('reveal', 'close');
        if (btn.attr('rel') == 'del')
            delete_cat();
    });
    $('#save-entry').click(save_entry);
    $('#nav-menu').on('click', 'img.add-subcat', function() {
        new_subcat($(this).parent());
        return false;
    });
    $('#nav-menu').on('click', 'img.add-entry', function() {
        new_entry($(this).parent());
        return false;
    });
    $('.hotness img').click(pepper_click);
    $('#id-prices a.add-price-row').click(add_price_row);
    $('#id-prices a.del-price-row').click(remove_price_row);
    show_flags();

    var photo = $('#id-photo');
    photo.find(':file').on('click', function(e) {e.stopPropagation(); });
    photo.on('click', function(e) {
        photo.find(':file').click();  return false;
    });

    $('#id-photo').dmUploader({
        url: '/admin/uplephoto',
        extraData: function() {
            var ret = get_entry_idx();
            ret.rid = $('#id-rid').val();
            return ret;
        },
        onBeforeUpload: function(id) {
            $('#upload-progress').show()
                .children().css('width', '0px');
            $('#id-photo').parent().find('span.error').hide();
        },
        onUploadSuccess: function(id, data) {
            $('#upload-progress').hide();
            if (data.status == 'ok') {
                var phurl = data.image + "?" + new Date().getTime();
                $('#id-photo > img').attr('src', phurl);
                $('#id-entry_photo').val(phurl);
            }
            else {
                $('#id-photo').parent().find('span.error')
                    .text(data.file || data.general)
                    .css('display', 'block');
            }
        },
        onUploadError: function(id, message) {
            $('#upload-progress').hide();
            $('#id-photo').parent().find('span.error')
                    .text('Server error. Upload failed.')
                    .css('display', 'block');
        },
        onUploadProgress: function(id, percent) {
            $('#upload-progress > div:first-child').css('width', percent+'%');
        }
    });
    $('#id-photo img').on('dragenter', function() {
        $('#id-photo').addClass('hover');
    });
    var fn = function(e) {
        $('#id-photo').removeClass('hover');
    };
    $('#id-photo img').on('dragleave', fn).on('drop', fn);

});