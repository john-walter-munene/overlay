import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import {
  RolesGuard,
  Roles,
  PermissionsGuard,
  Permissions,
} from '../../common/roles.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import type { AuthUser } from '../../common/crypto';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  // ---- public (SEO) ----

  @Get()
  list(
    @Query('tag') tag?: string,
    @Query('category') category?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('locale') locale?: string,
  ) {
    return this.articles.listPublished(
      {
        tag,
        category: category === 'news' ? 'news' : category === 'content' ? 'content' : undefined,
        take: take ? Number(take) : undefined,
        skip: skip ? Number(skip) : undefined,
      },
      locale ?? 'en',
    );
  }

  @Get('tags')
  tags() {
    return this.articles.listTags();
  }

  @Get('sitemap')
  sitemap() {
    return this.articles.listPublishedSlugs();
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.articles.getPublishedBySlug(slug, locale ?? 'en');
  }

  // ---- authoring (admin + approved tipsters) ----

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('content:moderate')
  all() {
    return this.articles.listAll();
  }

  /** Articles the caller may manage (moderators: all, tipsters: their own). */
  @Get('manage/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'staff', 'tipster')
  mine(@CurrentUser() user: AuthUser) {
    return this.articles.listMine(user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'tipster')
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: AuthUser) {
    return this.articles.create(user, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'staff', 'tipster')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.articles.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'staff', 'tipster')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.articles.remove(id, user);
  }
}
