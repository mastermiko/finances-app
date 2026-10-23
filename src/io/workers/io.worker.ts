/// <reference lib="webworker" />
import { expose } from 'comlink';
import { ioApi } from './io-api';

expose(ioApi);
