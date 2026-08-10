import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { RepositoryService } from './database/repository.service';
import { AuthService } from './auth/auth.service';
import { SessionGuard } from './auth/session.guard';
import { AuthController } from './auth/auth.controller';
import { ScenicController } from './business/scenic.controller';
import { OrdersController } from './business/orders.controller';
import { FinanceController } from './business/finance.controller';
import { FinanceService } from './business/finance.service';
import { CommandsController } from './business/commands.controller';
import { CommandsService } from './business/commands.service';
import { SystemController } from './business/system.controller';
import { SystemService } from './business/system.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal:true })],
  controllers: [AuthController,ScenicController,OrdersController,FinanceController,CommandsController,SystemController],
  providers: [RepositoryService,AuthService,FinanceService,CommandsService,SystemService,{provide:APP_GUARD,useClass:SessionGuard}],
})
export class AppModule {}
