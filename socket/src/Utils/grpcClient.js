import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';

const PROTO_PATH = path.join('./chess.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition);

const grpcClient = new proto.chess.ChessService(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

export default grpcClient;
