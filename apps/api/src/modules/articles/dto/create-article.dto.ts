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
  @IsOptional() @IsString() @MaxLength(80) slug?: string;

  @IsString() @MinLength(1) @MaxLength(50_000) body!: string;

  @IsOptional() @IsString() @MaxLength(300) excerpt?: string;
  @IsOptional() @IsString() @MaxLength(2048) coverImage?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(40, { each: true }) tags?: string[];

  @IsOptional()
  @IsIn(['content', 'news'])
  category?: 'content' | 'news';

  @IsOptional()
  @IsIn(['draft', 'pending', 'published', 'archived'])
  status?: 'draft' | 'pending' | 'published' | 'archived';

  @IsOptional() @IsString() @MaxLength(70) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) seoDescription?: string;
  @IsOptional() @IsString() @MaxLength(2048) canonicalUrl?: string;
}
