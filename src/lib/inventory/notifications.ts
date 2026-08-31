import type {
  InventoryAlertType,
  InventoryNotificationStatus,
} from "@/drizzle/schema/inventoryAlert";

export type InventoryNotification = {
  productId: number;
  type: InventoryAlertType;
  availableQuantity: number;
  threshold: number;
};

export interface InventoryNotificationService {
  notifyInventoryAlert(
    notification: InventoryNotification
  ): Promise<InventoryNotificationStatus>;
}

export class DatabaseOnlyInventoryNotificationService
  implements InventoryNotificationService
{
  async notifyInventoryAlert(): Promise<InventoryNotificationStatus> {
    return "not_configured";
  }
}
