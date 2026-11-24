import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthService } from './auth/auth.service.js';
import { AnalysisService } from './watershed/analysis.service.js';
import { UploadService } from './watershed/upload.service.js';
import { WatershedController } from './watershed/watershed.controller.js';
import { RiverStreamsService } from './watershed/river-streams.service.js';
import { HydrologyStationsService } from './watershed/hydrology-stations.service.js';

@Module({
  imports: [],
  controllers: [AppController, AuthController, WatershedController],
  providers: [AppService, AuthService, AnalysisService, UploadService, RiverStreamsService, HydrologyStationsService],
})
export class AppModule {}
