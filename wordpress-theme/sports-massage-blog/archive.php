<?php
if (!defined('ABSPATH')) {
    exit;
}

get_header();
?>
<main class="content-grid">
    <div class="content-main">
        <header class="archive-header">
            <p class="section-eyebrow"><?php esc_html_e('Archivo', 'sports-massage-blog'); ?></p>
            <h1 class="entry-title"><?php the_archive_title(); ?></h1>
            <div class="entry-summary"><?php the_archive_description(); ?></div>
        </header>
        <?php while (have_posts()) : the_post(); ?>
            <article <?php post_class('entry-card'); ?>>
                <div class="post-meta"><?php echo esc_html(get_the_date()); ?></div>
                <h2 class="entry-title"><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
                <div class="entry-summary"><?php the_excerpt(); ?></div>
            </article>
        <?php endwhile; ?>
    </div>
    <aside class="content-sidebar">
        <?php get_sidebar(); ?>
    </aside>
</main>
<?php
get_footer();
