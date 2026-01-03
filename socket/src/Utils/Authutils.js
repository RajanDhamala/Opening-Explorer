import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken';
import dotenv from "dotenv"
import {v4 as uuidv4} from "uuid"
dotenv.config()

const hashPassword=async(plain,rounds=10)=>{
    return  await bcrypt.hash(plain, rounds)
}

const verifyPassword=async(plain,hashed)=>{
    return await bcrypt.compare(plain,hashed);
}

const CreateAccessToken = (id,email,fullname) => {
    const payload = {
      id: id,
      fullname,
      email,
    };
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
  }
  
  const CreateRefreshToken = (id,email,fullname) => {
    const payload = {
      id: id,
      email,
      fullname
    };
    return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
  }

const CreateClientId = (ipAddress) => {
  const clientId = uuidv4();
  const payload = {
    id: clientId,
    ip: ipAddress,
    fullname:"anonymous",
    createdAt: new Date().toISOString(),
  };
  return jwt.sign(payload, process.env.CLIENT_TOKEN_SECRET, {
    expiresIn: "30d",
  });
};
export{
    hashPassword,verifyPassword,
    CreateAccessToken,CreateRefreshToken
  ,CreateClientId
}
