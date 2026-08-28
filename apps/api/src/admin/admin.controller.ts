import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from './admin-only.decorator';
import { AdminCapabilitiesDto } from './dto/admin-capabilities.dto';

@ApiTags('admin')
@AdminOnly()
@Controller('admin')
export class AdminController {
  @Get('capabilities')
  @ApiOperation({
    summary: 'Resolve the current administrator shell capability',
  })
  @ApiOkResponse({ type: AdminCapabilitiesDto })
  capabilities(): AdminCapabilitiesDto {
    return { productManagement: true };
  }
}
