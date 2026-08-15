from marshmallow import EXCLUDE, fields, Schema


class Connect(Schema):
    class Meta:
        unknown = EXCLUDE

    base_url = fields.String(required=True, validate=lambda a: a and not a.isspace())
    email = fields.String(required=True, validate=lambda a: a and not a.isspace())
    password = fields.String(required=True, validate=lambda a: a and not a.isspace())


class SignIn(Schema):
    class Meta:
        unknown = EXCLUDE

    # No base_url: the server this password is sent to comes from the stored
    # link, never from the request.
    email = fields.String(required=True, validate=lambda a: a and not a.isspace())
    password = fields.String(required=True, validate=lambda a: a and not a.isspace())
    device = fields.String()


class ChooseHome(Schema):
    class Meta:
        unknown = EXCLUDE

    home_id = fields.String(required=True, validate=lambda a: a and not a.isspace())
