import gdal from 'gdal-async';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

if (gdal.bundled && 'setPROJSearchPath' in gdal && typeof gdal.setPROJSearchPath === 'function') {
  const packageEntry = createRequire(import.meta.url).resolve('gdal-async');
  gdal.setPROJSearchPath(resolve(dirname(packageEntry), '..', 'deps', 'libproj', 'proj', 'data'));
}

export default gdal;
