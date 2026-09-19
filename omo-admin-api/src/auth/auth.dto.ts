import { IsString, Length, Matches } from 'class-validator';
export class LoginDto { @IsString() @Length(3, 64) username!: string; @IsString() @Length(6, 128) password!: string; }
export class ChangePasswordDto { @IsString() @Length(6, 128) currentPassword!: string; @IsString() @Length(12, 128) @Matches(/[A-Z]/, { message: '新密码至少包含一个大写字母' }) @Matches(/[a-z]/, { message: '新密码至少包含一个小写字母' }) @Matches(/\d/, { message: '新密码至少包含一个数字' }) newPassword!: string; }
