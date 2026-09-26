export const validate = (schemas) => (req, _res, next) => {
  req.validated = {};
  for (const [location, schema] of Object.entries(schemas))
    req.validated[location] = schema.parse(req[location]);
  next();
};
