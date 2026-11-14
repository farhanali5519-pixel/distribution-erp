import { ModuleRegistry } from '../core/registry/module-registry';
import { salesModule, registerSalesEventListeners } from './sales';
import { customersModule } from './customers';
import { inventoryModule } from './inventory';
import { expensesModule, registerExpenseEventListeners } from './expenses';
import { purchaseModule } from './purchase';
import { closingModule } from './closing';
import { returnsModule } from './returns';
import { reportsModule } from './reports';
import { paymentsModule } from './payments';
import { bankingModule } from './banking';
import { accountsModule } from './accounts';
import { authModule } from './auth';
import { settingsModule } from './settings';
import { fieldOrderBookingModule } from './field-order-booking';

let isInitialized = false;

export function initializeSystemModules(): void {
  if (isInitialized) return;

  // 1. Register All 14 System Modules with Central Registry
  ModuleRegistry.register(salesModule);
  ModuleRegistry.register(fieldOrderBookingModule);
  ModuleRegistry.register(customersModule);
  ModuleRegistry.register(inventoryModule);
  ModuleRegistry.register(expensesModule);
  ModuleRegistry.register(purchaseModule);
  ModuleRegistry.register(closingModule);
  ModuleRegistry.register(returnsModule);
  ModuleRegistry.register(reportsModule);
  ModuleRegistry.register(paymentsModule);
  ModuleRegistry.register(bankingModule);
  ModuleRegistry.register(accountsModule);
  ModuleRegistry.register(authModule);
  ModuleRegistry.register(settingsModule);

  // 2. Register Cross-Domain Event Listeners
  registerSalesEventListeners();
  registerExpenseEventListeners();

  isInitialized = true;
}

