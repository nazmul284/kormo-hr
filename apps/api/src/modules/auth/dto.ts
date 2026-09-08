import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'employee', description: 'Username, official email, or employee ID' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  identifier!: string;

  @ApiProperty({ example: 'Kormo@123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;

  @ApiPropertyOptional({ description: 'Extends the refresh window on a trusted device' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ minLength: 8, description: 'At least 8 characters, with a letter and a digit' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'employee@shurjo.example' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  identifier!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}

export class SwitchCompanyDto {
  @ApiProperty({ example: 1 })
  @IsOptional()
  companyId!: number;
}
