import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateArticleDto {
  @IsString() @MinLength(3) @MaxLength(160) title!: string;

  /** Optional explicit slug; derived from title when omitted. */
  @IsOptional() @IsString() slug?: string;

  @IsString() @MinLength(1) body!: string;

  @IsOptional() @IsString() @MaxLength(300) excerpt?: string;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  @IsOptional()
  @IsIn(['draft', 'pending', 'published', 'archived'])
  status?: 'draft' | 'pending' | 'published' | 'archived';

  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) seoDescription?: string;
  @IsOptional() @IsString() canonicalUrl?: string;
}
