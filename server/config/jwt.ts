const jwtSecret = process.env.JWT_SECRET?.trim();

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters");
}

const JWT_SECRET: string = jwtSecret;

export default JWT_SECRET;