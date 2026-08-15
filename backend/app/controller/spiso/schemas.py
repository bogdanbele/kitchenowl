from marshmallow import EXCLUDE, fields, Schema


class Connect(Schema):
    class Meta:
        unknown = EXCLUDE

    base_url = fields.String(required=True, validate=lambda a: a and not a.isspace())
    email = fields.String(required=True, validate=lambda a: a and not a.isspace())
    password = fields.String(required=True, validate=lambda a: a and not a.isspace())


class ChooseHome(Schema):
    class Meta:
        unknown = EXCLUDE

    home_id = fields.String(required=True, validate=lambda a: a and not a.isspace())
