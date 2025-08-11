import { flag } from 'flags/next';
import { getAll } from '@vercel/edge-config';

export type IMaintenanceNotice =
  | {
      enabled: true;
      startTime: string; // Date
      endTime: string; // Date
    }
  | {
      enabled: false;
      startTime?: undefined;
      endTime?: undefined;
    };

export const maintenanceNoticeFlag = flag({
  key: 'maintenance-notice',
  async decide() {
    try {
      if (!process.env.EDGE_CONFIG) {
        return { enabled: false } as const;
      }

      const flags = await getAll([
        'maintenance-notice_start-time',
        'maintenance-notice_end-time',
        'maintenance-notice_enabled',
      ]);

      if (!flags['maintenance-notice_enabled']) {
        return { enabled: false } as const;
      }

      const startTime = new Date(flags['maintenance-notice_start-time']);
      const endTime = new Date(flags['maintenance-notice_end-time']);

      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        throw new Error(
          `Invalid maintenance notice start or end time: ${flags['maintenance-notice_start-time']} or ${flags['maintenance-notice_end-time']}`,
        );
      }

      return {
        enabled: true,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      } as const;
    } catch (cause) {
      console.error(
        new Error('Failed to get maintenance notice flag', { cause }),
      );
      return { enabled: false } as const;
    }
  },
});
