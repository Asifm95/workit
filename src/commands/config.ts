import { loadConfig } from '../core/config';
import { info, success } from '../ui/log';

export async function runConfigCommand(): Promise<void> {
  const { config, created, path } = await loadConfig();
  if (created) {
    success(`wrote default config to ${path}`);
  } else {
    info(`config: ${path}`);
  }
  console.log(JSON.stringify(config, null, 2));
}
