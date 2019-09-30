"""
Various validators.
validate() returns a tuple of (field, message) if the validation failed.
data can be either a dictionary or a string. The "Required" validator must be passed a dictinary.
If the validation passes, validators return (True, (potentially reformatted) field value).
If the validation fails, validators return (False, message)
"""
import types
import numbers
import re
from validate_email import validate_email
import inspect

class ValidatorBase(object):
    INVALID_MSG = 'Invalid data'

    def __init__(self, **kwargs):
        """ kwargs: optional (True|False)
                    required - "field is required" message
                    invalid - "validation failed" message
        """
        self._optional = kwargs.get('optional', False)
        self._required_msg = kwargs.get('required', Required.INVALID_MSG)
        self._invalid_msg = kwargs.get('invalid', self.__class__.INVALID_MSG)

    def validate(self, data, **kwargs):
        field, val = None, None
        if isinstance(data, dict):
            field = kwargs.get('field', None)
            if not field:
                raise ValueError('field: required argument')
            val = str(data.get(field, '')).strip()
        else:
            val = str(data).strip() if data is not None else ''
        if not val:
            if self._optional:
                return True, val
            else:
                return False, self._required_msg
        return self._do_validate(val)

    def _do_validate(self, val):
        """ Returns: True, formatted value (phone number case)
                     or
                     False, message if validation fails
        """
        return True, val


class Required(ValidatorBase):
    INVALID_MSG = 'Required field'
    # no need for _do_validate has the base class handles that


class Slug(ValidatorBase):
    INVALID_MSG = 'Invalid slug format'

    def _do_validate(self, val):
        slugre = re.compile('^[a-z1-9]+(-[a-z1-9]+)*$')
        result = slugre.match(val)
        return (True, val) if result else (False, self._invalid_msg)


class PhoneNumber(ValidatorBase):
    INVALID_MSG  =  'Invalid phone number'
    _res = [re.compile('^\d{10,11}$'),
            re.compile('^\(\d{3}\) *\d{3} *[-] *\d{4}$'),
            re.compile('^\d{3} *- *\d{3} *- *\d{4}$'),
            re.compile('^\d{3} *\. *\d{3} *\. *\d{4}$'),
            re.compile('^(1 *- *)?\d{3} *- *\d{3} *- *\d{4}$'),
            re.compile('^(1 *\. *)?\d{3} *\. *\d{3} *\. *\d{4}$')]

    def _do_validate(self, val):
        for r in PhoneNumber._res:
            if r.match(val):
                # convert to an unified format: 1-8XX-XXX-XXX or XXX-XXX-XXXX
                digits = re.sub('[^\d]', '', val)
                # print '*** digits: ', digits
                numdigits =  len(digits)
                if numdigits == 10:
                    return True, '%s-%s-%s' % (digits[0:3], digits[3:6], digits[6:10])
                elif numdigits == 11:
                    return True, '1-%s-%s-%s' % (digits[1:4], digits[4:7], digits[7:11])
                return True, val # This should not happen
        return False, self._invalid_msg


class Email(ValidatorBase):
    INVALID_MSG = 'Invalid email'

    def _do_validate(self, val):
        # Just format check. Verification if the host has an SMPT server or if the emai exists take too long
        return (True, val) if validate_email(val) else (False, self._invalid_msg)


class Username(ValidatorBase):
    INVALID_MSG = """Invalid user name:<br>
Must only contain latin letters and numbers.<br>
Can not start with a number.<br>
Minimum length: %d characters."""
    DEFAULT_MIN_WIDTH = 6

    def __init__(self, **kwargs):
        super(self.__class__, self).__init__(**kwargs)
        self._minlen = kwargs.get('minlen', Username.DEFAULT_MIN_WIDTH)
        if type(self._minlen) != int:
            raise ValueError('minlen must be an integer number')
        if self._invalid_msg.find('%d'):
            self._invalid_msg = self._invalid_msg % self._minlen

    def _do_validate(self, val):
        # TODO: have a separate message if too short
        if not re.match('^[a-z][a-z0-9]+$', val, re.IGNORECASE) or len(val) < self._minlen:
            return False, self._invalid_msg
        return True, val


class Value(ValidatorBase):
    INVALID_MSG = None

    def __init__(self, value, **kwargs):
        """
        Value(int).validate(val): check if val is an integer
        Value(float).validate(val): check if a float
        Value(bool).validate(val): check if true|false
        Value((min,max)).validate(val) check if val is within range (int|float)
        """
        super(self.__class__, self).__init__(**kwargs)
        self._value = value
        if value is float or value is long or value is int:
            def validate(val):
                try:
                    return True, self._value(val)
                except ValueError:
                    return False, self._invalid_msg or 'Integral value expected'
            self._validate_internal = validate
        elif value is bool:
            def validate(val):
                strval = str(val).lower()
                if val == True or val == False:
                    return True, val
                elif strval == 'true':
                    return True, True
                elif strval == 'false':
                    return True, False
                return False, val
            self._validate_internal = validate
        elif isinstance(value, tuple): # tuple: two elements: min and max
            if len(value) != 2:
                raise ValueError('Range validation: value must be a two element tuple.')
            if not isinstance(value[0], numbers.Number):
                raise ValueError('Range validation: only ints and floats are supported')
            def validate(val):
                needfloat = isinstance(self._value[0], float)
                msg = 'Float value expected' if needfloat else 'Int value expected'
                try:
                    val = float(val) if needfloat else int(val)
                    return self._value[0] <= val <= self._value[1], val
                except ValueError:
                    return False, self._invalid_msg or msg
            self._validate_internal = validate
        else:
            raise ValueError('Unsupported value/type')

    def _do_validate(self, val):
        return self._validate_internal(val)



class HoursRange(ValidatorBase):
    INVALID_MSG = 'Invalid business hours. Allowed values are: start time - end time.'
    _re = re.compile('^(0?[0-9]|1[0-2])(:[0-5][0-9])? *(am|pm) *- *(0?[0-9]|1[0-2])(:[0-5][0-9])? *(am|pm)$', re.IGNORECASE)

    def _do_validate(self, val):
        if not HoursRange._re.match(val):
            return False, self._invalid_msg
        # insert :00 if minutes not present and uppercase
        h = re.split(' *- *', val)
        if h[0].find(':')==-1:
            h[0] = h[0][:-2]+':00'+h[0][-2:]
        if h[1].find(':')==-1:
            h[1] = h[1][:-2]+':00'+h[0][-2:]
        return True, h[0].upper() + ' - ' + h[1].upper()


class MonetaryAmount(ValidatorBase):
    INVALID_MSG = 'Invalid monetary amount.'
    _re = re.compile('^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$')

    def _do_validate(self, val):
        if not MonetaryAmount._re.match(val):
            return False, self._invalid_msg
        return True, float(val)


def validate_data(data, validations):
    if not isinstance(data, dict):
        raise ValueError("data: expected a dictionary")
    if not isinstance(data, dict):
        raise ValueError("validations: expected a dictionary")
    errors = {}
    for field, validator_template in validations.iteritems():
        val = data.get(field, None)
        if isinstance(validator_template, ValidatorBase):
            validator = validator_template
        elif inspect.isclass(validator_template) and issubclass(validator_template, ValidatorBase):
            validator = validator_template()
        else:
            raise ValueError("Expected a validator instance or a validator class")
        passed, val = validator.validate(val)
        if passed:
            data[field] = val
        else:
            errors[field] = val
    return errors
